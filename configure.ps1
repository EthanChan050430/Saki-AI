$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = Join-Path $ProjectRoot 'data'
$ExampleConfigPath = Join-Path $DataDir 'global_config.example.json'
$ConfigPath = Join-Path $DataDir 'global_config.json'
$HiddenLauncherPath = Join-Path $ProjectRoot 'start-hidden.vbs'
$StartupFolderPath = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$StartupEntryPath = Join-Path $StartupFolderPath 'Saki AI Autostart.cmd'
$ScheduledTaskName = 'Saki AI Autostart'
$script:WizardWarnings = @()
$script:InvalidConfigBackupNeeded = $false

function Write-Rule {
    Write-Host ('=' * 72)
}

function Write-Section([string]$Title) {
    Write-Host ''
    Write-Rule
    Write-Host $Title
    Write-Rule
}

function ConvertFrom-SecureInput([Security.SecureString]$SecureValue) {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function ConvertTo-Hashtable($Value) {
    if ($null -eq $Value) {
        return $null
    }

    if ($Value -is [System.Collections.IDictionary]) {
        $result = [ordered]@{}
        foreach ($key in $Value.Keys) {
            $result[$key] = ConvertTo-Hashtable $Value[$key]
        }
        return $result
    }

    if ($Value -is [pscustomobject]) {
        $result = [ordered]@{}
        foreach ($property in $Value.PSObject.Properties) {
            $result[$property.Name] = ConvertTo-Hashtable $property.Value
        }
        return $result
    }

    if (($Value -is [System.Collections.IEnumerable]) -and -not ($Value -is [string])) {
        $items = @()
        foreach ($item in $Value) {
            $items += ,(ConvertTo-Hashtable $item)
        }
        return $items
    }

    return $Value
}

function Try-RecoverUnreadableConfig([string]$Raw) {
    $options = [System.Text.RegularExpressions.RegexOptions]::Singleline
    $pattern = '"systemPrompt"\s*:\s*".*?(?=,\s*\r?\n\s*"[A-Za-z0-9_]+"\s*:)'

    if (-not [System.Text.RegularExpressions.Regex]::IsMatch($Raw, $pattern, $options)) {
        return $null
    }

    $repaired = [System.Text.RegularExpressions.Regex]::Replace($Raw, $pattern, '"systemPrompt": ""', $options)

    try {
        return [pscustomobject]@{
            Config = ConvertTo-Hashtable (ConvertFrom-Json -InputObject $repaired)
            Warning = 'Recovered most values from the unreadable config by resetting the broken systemPrompt field for this session.'
        }
    }
    catch {
        return $null
    }
}

function Read-JsonHashtable {
    param(
        [string]$Path,
        [switch]$Required
    )

    if (-not (Test-Path $Path)) {
        return [ordered]@{}
    }

    $raw = Get-Content -Path $Path -Raw -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return [ordered]@{}
    }

    try {
        return ConvertTo-Hashtable (ConvertFrom-Json -InputObject $raw)
    }
    catch {
        if ($Required) {
            throw
        }

        $recovered = Try-RecoverUnreadableConfig -Raw $raw
        if ($null -ne $recovered) {
            $script:WizardWarnings += ("Recovered {0} for this session. Saving will also back up the original broken file." -f $Path)
            $script:WizardWarnings += $recovered.Warning
            $script:InvalidConfigBackupNeeded = $true
            return $recovered.Config
        }

        $script:WizardWarnings += ("Could not parse {0}. The wizard will continue with defaults until you save a new config." -f $Path)
        $script:InvalidConfigBackupNeeded = $true
        return [ordered]@{}
    }
}

function Merge-Hashtable([System.Collections.IDictionary]$Base, [System.Collections.IDictionary]$Overlay) {
    foreach ($key in $Overlay.Keys) {
        if (
            $Base.Contains($key) -and
            ($Base[$key] -is [System.Collections.IDictionary]) -and
            ($Overlay[$key] -is [System.Collections.IDictionary])
        ) {
            Merge-Hashtable -Base $Base[$key] -Overlay $Overlay[$key] | Out-Null
        }
        else {
            $Base[$key] = $Overlay[$key]
        }
    }

    return $Base
}

function Get-NestedValue([System.Collections.IDictionary]$Root, [string[]]$Path, $Default = $null) {
    $current = $Root
    foreach ($segment in $Path) {
        if (-not ($current -is [System.Collections.IDictionary]) -or -not $current.Contains($segment)) {
            return $Default
        }
        $current = $current[$segment]
    }
    return $current
}

function Ensure-NestedHashtable([System.Collections.IDictionary]$Root, [string[]]$Path) {
    $current = $Root
    foreach ($segment in $Path) {
        if (-not $current.Contains($segment) -or -not ($current[$segment] -is [System.Collections.IDictionary])) {
            $current[$segment] = [ordered]@{}
        }
        $current = $current[$segment]
    }
    return $current
}

function Format-CurrentValue($Value, [switch]$Secret) {
    if ($Secret) {
        if ([string]::IsNullOrWhiteSpace([string]$Value)) {
            return '[empty]'
        }
        return '[set]'
    }

    if ($null -eq $Value) {
        return '[empty]'
    }

    if ($Value -is [bool]) {
        if ($Value) {
            return 'true'
        }
        return 'false'
    }

    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
        return '[empty]'
    }

    return $text
}

function Prompt-Text {
    param(
        [string]$Label,
        [string]$CurrentValue = '',
        [switch]$Secret
    )

    Write-Host $Label
    Write-Host ("Current: {0}" -f (Format-CurrentValue -Value $CurrentValue -Secret:$Secret))
    Write-Host 'Press Enter to keep the current value. Type - to clear it.'

    if ($Secret) {
        $entered = ConvertFrom-SecureInput (Read-Host -Prompt 'Value' -AsSecureString)
    }
    else {
        $entered = Read-Host -Prompt 'Value'
    }

    if ([string]::IsNullOrEmpty($entered)) {
        return $CurrentValue
    }

    if ($entered -eq '-') {
        return ''
    }

    return $entered.Trim()
}

function Prompt-Bool {
    param(
        [string]$Label,
        [bool]$CurrentValue = $false
    )

    while ($true) {
        Write-Host $Label
        Write-Host ("Current: {0}" -f (Format-CurrentValue $CurrentValue))
        $raw = Read-Host -Prompt 'Enter Y, N, or press Enter to keep'

        if ([string]::IsNullOrWhiteSpace($raw)) {
            return $CurrentValue
        }

        switch ($raw.Trim().ToUpperInvariant()) {
            'Y' { return $true }
            'N' { return $false }
            default {
                Write-Host 'Please enter Y, N, or just press Enter.'
            }
        }
    }
}

function Select-Option {
    param(
        [string]$Title,
        [array]$Options,
        [string]$DefaultValue = 'skip'
    )

    Write-Host $Title
    for ($index = 0; $index -lt $Options.Count; $index++) {
        $item = $Options[$index]
        $defaultMarker = if ($item.Value -eq $DefaultValue) { ' [default]' } else { '' }
        Write-Host ("{0}. {1}{2}" -f ($index + 1), $item.Label, $defaultMarker)
        if ($item.Description) {
            Write-Host ("   {0}" -f $item.Description)
        }
    }

    while ($true) {
        $raw = Read-Host -Prompt 'Choice'
        if ([string]::IsNullOrWhiteSpace($raw)) {
            return $DefaultValue
        }

        $parsed = 0
        if ([int]::TryParse($raw, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le $Options.Count) {
            return $Options[$parsed - 1].Value
        }

        Write-Host 'Please enter one of the listed numbers.'
    }
}

function Get-AutostartMode {
    $hasStartupEntry = Test-Path $StartupEntryPath
    $queryCommand = ('schtasks.exe /Query /TN "{0}" >nul 2>nul' -f $ScheduledTaskName.Replace('"', '""'))
    cmd.exe /c $queryCommand | Out-Null
    $hasTask = $LASTEXITCODE -eq 0

    if ($hasTask) {
        return 'scheduled-task'
    }

    if ($hasStartupEntry) {
        return 'startup-folder'
    }

    return 'disabled'
}

function Ensure-HiddenLauncherExists {
    if (-not (Test-Path $HiddenLauncherPath)) {
        throw "Required helper file is missing: $HiddenLauncherPath"
    }
}

function Remove-AutostartEntries {
    if (Test-Path $StartupEntryPath) {
        Remove-Item -Path $StartupEntryPath -Force
    }

    $deleteCommand = ('schtasks.exe /Delete /TN "{0}" /F >nul 2>nul' -f $ScheduledTaskName.Replace('"', '""'))
    cmd.exe /c $deleteCommand | Out-Null
}

function Set-StartupFolderAutostart {
    Ensure-HiddenLauncherExists
    if (-not (Test-Path $StartupFolderPath)) {
        New-Item -ItemType Directory -Path $StartupFolderPath -Force | Out-Null
    }

    Remove-AutostartEntries

    $content = @(
        '@echo off',
        ('wscript.exe //B //Nologo "{0}"' -f $HiddenLauncherPath)
    )
    Set-Content -Path $StartupEntryPath -Value $content -Encoding ASCII
}

function Set-ScheduledTaskAutostart {
    Ensure-HiddenLauncherExists
    Remove-AutostartEntries

    $taskCommand = ('wscript.exe //B //Nologo "{0}"' -f $HiddenLauncherPath)
    schtasks.exe /Create /F /SC ONLOGON /TN $ScheduledTaskName /TR $taskCommand | Out-Null
}

function Save-Config([System.Collections.IDictionary]$Config) {
    if (-not (Test-Path $DataDir)) {
        New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
    }

    if ($script:InvalidConfigBackupNeeded -and (Test-Path $ConfigPath)) {
        $backupPath = Join-Path $DataDir ('global_config.invalid-backup-{0}.json' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
        Copy-Item -Path $ConfigPath -Destination $backupPath -Force
        $script:WizardWarnings += ("Backed up the unreadable config to: {0}" -f $backupPath)
        $script:InvalidConfigBackupNeeded = $false
    }

    $json = $Config | ConvertTo-Json -Depth 12
    Set-Content -Path $ConfigPath -Value $json -Encoding UTF8
}

function Configure-Provider([System.Collections.IDictionary]$Config) {
    Write-Section 'Step 1 - Chat Provider'
    $existingProvider = [string](Get-NestedValue $Config @('provider') '')

    $choice = Select-Option -Title 'Choose how Saki should talk to an AI model.' -DefaultValue 'skip' -Options @(
        @{ Value = 'skip'; Label = 'Skip'; Description = ('Keep current provider: {0}' -f (Format-CurrentValue $Config['provider'])) },
        @{ Value = 'ollama'; Label = 'Ollama'; Description = 'Use a local Ollama server.' },
        @{ Value = 'custom'; Label = 'Custom API'; Description = 'Use an OpenAI-compatible base URL and API key.' },
        @{ Value = 'copilot'; Label = 'GitHub Copilot'; Description = 'Use GitHub Copilot models and optional token.' }
    )

    switch ($choice) {
        'ollama' {
            $defaultModel = if ($existingProvider -eq 'ollama') { [string](Get-NestedValue $Config @('model') 'llama3') } else { 'llama3' }
            $Config['provider'] = 'ollama'
            $Config['model'] = Prompt-Text -Label 'Ollama model ID' -CurrentValue $defaultModel
            $Config['ollamaUrl'] = Prompt-Text -Label 'Ollama endpoint' -CurrentValue ([string](Get-NestedValue $Config @('ollamaUrl') 'http://localhost:11434'))
        }
        'custom' {
            $defaultModel = if ($existingProvider -eq 'custom') { [string](Get-NestedValue $Config @('model') 'gpt-4o-mini') } else { 'gpt-4o-mini' }
            $Config['provider'] = 'custom'
            $Config['model'] = Prompt-Text -Label 'Custom chat model ID' -CurrentValue $defaultModel
            $Config['apiBaseUrl'] = Prompt-Text -Label 'Custom API base URL' -CurrentValue ([string](Get-NestedValue $Config @('apiBaseUrl') 'https://api.openai.com/v1'))
            $Config['apiKey'] = Prompt-Text -Label 'Custom API key' -CurrentValue ([string](Get-NestedValue $Config @('apiKey') '')) -Secret
        }
        'copilot' {
            $defaultModel = if ($existingProvider -eq 'copilot') { [string](Get-NestedValue $Config @('model') 'gpt-4o') } else { 'gpt-4o' }
            $Config['provider'] = 'copilot'
            $Config['model'] = Prompt-Text -Label 'Copilot model ID' -CurrentValue $defaultModel
            $Config['copilotToken'] = Prompt-Text -Label 'Copilot token (leave blank to rely on local login)' -CurrentValue ([string](Get-NestedValue $Config @('copilotToken') '')) -Secret
        }
    }
}

function Configure-Search([System.Collections.IDictionary]$Config) {
    Write-Section 'Step 2 - Web Search'

    $choice = Select-Option -Title 'Choose the default search provider for web-enabled tasks.' -DefaultValue 'skip' -Options @(
        @{ Value = 'skip'; Label = 'Skip'; Description = ('Keep current engine: {0}' -f (Format-CurrentValue $Config['searchEngine'])) },
        @{ Value = 'off'; Label = 'Disable web search'; Description = 'Search tools stay off by default.' },
        @{ Value = 'searxng'; Label = 'SearxNG'; Description = 'Self-hosted metasearch endpoint.' },
        @{ Value = 'google'; Label = 'Google Custom Search'; Description = 'Requires API key and CX ID.' },
        @{ Value = 'bing'; Label = 'Bing'; Description = 'Requires a Bing/Azure API key.' },
        @{ Value = 'duckduckgo'; Label = 'DuckDuckGo'; Description = 'Unauthenticated basic search.' }
    )

    if ($choice -eq 'skip') {
        return
    }

    $Config['searchEngine'] = $choice
    if ($choice -eq 'off') {
        $Config['searchEnabled'] = $false
        return
    }

    $Config['searchEnabled'] = Prompt-Bool -Label 'Turn on the search toggle by default?' -CurrentValue ([bool](Get-NestedValue $Config @('searchEnabled') $false))

    switch ($choice) {
        'searxng' {
            $Config['searxngUrl'] = Prompt-Text -Label 'SearxNG URL' -CurrentValue ([string](Get-NestedValue $Config @('searxngUrl') 'http://127.0.0.1:8080'))
        }
        'google' {
            $Config['googleApiKey'] = Prompt-Text -Label 'Google API key' -CurrentValue ([string](Get-NestedValue $Config @('googleApiKey') '')) -Secret
            $Config['googleCxId'] = Prompt-Text -Label 'Google CX ID' -CurrentValue ([string](Get-NestedValue $Config @('googleCxId') ''))
        }
        'bing' {
            $Config['bingApiKey'] = Prompt-Text -Label 'Bing API key' -CurrentValue ([string](Get-NestedValue $Config @('bingApiKey') '')) -Secret
        }
    }
}

function Configure-Drawing([System.Collections.IDictionary]$Config) {
    Write-Section 'Step 3 - Image Generation'

    $choice = Select-Option -Title 'Choose how image generation should work.' -DefaultValue 'skip' -Options @(
        @{ Value = 'skip'; Label = 'Skip'; Description = ('Keep current drawing provider: {0}' -f (Format-CurrentValue $Config['drawingProvider'])) },
        @{ Value = 'none'; Label = 'Disable drawing'; Description = 'Hide drawing support.' },
        @{ Value = 'stable-diffusion'; Label = 'Stable Diffusion'; Description = 'Connect to a local SD WebUI endpoint.' },
        @{ Value = 'custom'; Label = 'Custom drawing API'; Description = 'Use an OpenAI-compatible image endpoint.' }
    )

    switch ($choice) {
        'none' {
            $Config['drawingProvider'] = 'none'
            $Config['drawingModel'] = ''
        }
        'stable-diffusion' {
            $Config['drawingProvider'] = 'stable-diffusion'
            $Config['drawingModel'] = Prompt-Text -Label 'Stable Diffusion model label (optional)' -CurrentValue ([string](Get-NestedValue $Config @('sdModel') ''))
            $Config['sdModel'] = $Config['drawingModel']
            $Config['sdUrl'] = Prompt-Text -Label 'Stable Diffusion txt2img URL' -CurrentValue ([string](Get-NestedValue $Config @('sdUrl') 'http://127.0.0.1:7860/sdapi/v1/txt2img'))
        }
        'custom' {
            $Config['drawingProvider'] = 'custom'
            $Config['customDrawingUrl'] = Prompt-Text -Label 'Custom drawing API base URL' -CurrentValue ([string](Get-NestedValue $Config @('customDrawingUrl') 'https://api.openai.com/v1'))
            $Config['customDrawingKey'] = Prompt-Text -Label 'Custom drawing API key' -CurrentValue ([string](Get-NestedValue $Config @('customDrawingKey') '')) -Secret
            $Config['customDrawingModel'] = Prompt-Text -Label 'Custom drawing model ID' -CurrentValue ([string](Get-NestedValue $Config @('customDrawingModel') 'gpt-image-1'))
            $Config['drawingModel'] = $Config['customDrawingModel']
        }
    }
}

function Configure-Tts([System.Collections.IDictionary]$Config) {
    Write-Section 'Step 4 - Voice Output'

    $choice = Select-Option -Title 'Choose the default text-to-speech mode.' -DefaultValue 'skip' -Options @(
        @{ Value = 'skip'; Label = 'Skip'; Description = ('Keep current TTS provider: {0}' -f (Format-CurrentValue $Config['ttsProvider'])) },
        @{ Value = 'browser'; Label = 'Browser TTS'; Description = 'Use the browser speech engine.' },
        @{ Value = 'gpt-sovits'; Label = 'GPT-SoVITS'; Description = 'Use a local GPT-SoVITS API.' }
    )

    switch ($choice) {
        'browser' {
            $Config['ttsProvider'] = 'browser'
        }
        'gpt-sovits' {
            $Config['ttsProvider'] = 'gpt-sovits'
            $Config['sovitsUrl'] = Prompt-Text -Label 'GPT-SoVITS API URL' -CurrentValue ([string](Get-NestedValue $Config @('sovitsUrl') 'http://127.0.0.1:9880'))
            $Config['sovitsGptModel'] = Prompt-Text -Label 'GPT weight path (optional)' -CurrentValue ([string](Get-NestedValue $Config @('sovitsGptModel') ''))
            $Config['sovitsSovitsModel'] = Prompt-Text -Label 'SoVITS weight path (optional)' -CurrentValue ([string](Get-NestedValue $Config @('sovitsSovitsModel') ''))
            $Config['sovitsRefAudio'] = Prompt-Text -Label 'Reference audio path (optional)' -CurrentValue ([string](Get-NestedValue $Config @('sovitsRefAudio') ''))
            $Config['sovitsRefText'] = Prompt-Text -Label 'Reference text (optional)' -CurrentValue ([string](Get-NestedValue $Config @('sovitsRefText') ''))
        }
    }
}

function Configure-QQBot([System.Collections.IDictionary]$Config) {
    Write-Section 'Step 5 - QQ Bot'

    $qqbot = Ensure-NestedHashtable -Root (Ensure-NestedHashtable -Root $Config -Path @('thirdPartyChats')) -Path @('qqbot')
    $choice = Select-Option -Title 'Configure QQ Bot integration.' -DefaultValue 'skip' -Options @(
        @{ Value = 'skip'; Label = 'Skip'; Description = ('Keep QQ Bot enabled: {0}' -f (Format-CurrentValue ([bool](Get-NestedValue $Config @('thirdPartyChats', 'qqbot', 'enabled') $false)))) },
        @{ Value = 'disable'; Label = 'Disable QQ Bot'; Description = 'Turn off QQ Bot integration.' },
        @{ Value = 'configure'; Label = 'Configure QQ Bot'; Description = 'Set App ID, secret, and optional speech-to-text.' }
    )

    switch ($choice) {
        'disable' {
            $qqbot['enabled'] = $false
        }
        'configure' {
            $qqbot['enabled'] = $true
            $qqbot['appId'] = Prompt-Text -Label 'QQ Bot App ID' -CurrentValue ([string](Get-NestedValue $Config @('thirdPartyChats', 'qqbot', 'appId') ''))
            $qqbot['clientSecret'] = Prompt-Text -Label 'QQ Bot Client Secret' -CurrentValue ([string](Get-NestedValue $Config @('thirdPartyChats', 'qqbot', 'clientSecret') '')) -Secret
            $qqbot['sandbox'] = Prompt-Bool -Label 'Use QQ sandbox mode?' -CurrentValue ([bool](Get-NestedValue $Config @('thirdPartyChats', 'qqbot', 'sandbox') $false))
            $qqbot['markdownSupport'] = Prompt-Bool -Label 'Enable QQ markdown support?' -CurrentValue ([bool](Get-NestedValue $Config @('thirdPartyChats', 'qqbot', 'markdownSupport') $false))

            $sttChoice = Select-Option -Title 'Optional QQ voice transcription (STT).' -DefaultValue 'skip' -Options @(
                @{ Value = 'skip'; Label = 'Skip'; Description = 'Keep the current QQ STT settings.' },
                @{ Value = 'disable'; Label = 'Disable STT'; Description = 'Voice messages will not be auto-transcribed.' },
                @{ Value = 'configure'; Label = 'Configure STT'; Description = 'Provide a base URL, optional API key, and model.' }
            )

            switch ($sttChoice) {
                'disable' {
                    $qqbot['stt'] = [ordered]@{
                        enabled = $false
                        model = 'whisper-1'
                    }
                }
                'configure' {
                    $qqbot['stt'] = [ordered]@{
                        enabled = $true
                        baseUrl = Prompt-Text -Label 'STT base URL' -CurrentValue ([string](Get-NestedValue $Config @('thirdPartyChats', 'qqbot', 'stt', 'baseUrl') 'https://api.openai.com/v1'))
                        apiKey = Prompt-Text -Label 'STT API key (optional)' -CurrentValue ([string](Get-NestedValue $Config @('thirdPartyChats', 'qqbot', 'stt', 'apiKey') '')) -Secret
                        model = Prompt-Text -Label 'STT model ID' -CurrentValue ([string](Get-NestedValue $Config @('thirdPartyChats', 'qqbot', 'stt', 'model') 'whisper-1'))
                    }
                }
            }
        }
    }
}

function Configure-Permissions([System.Collections.IDictionary]$Config) {
    Write-Section 'Step 6 - Agent Permissions'

    $choice = Select-Option -Title 'Choose the default agent permission mode.' -DefaultValue 'skip' -Options @(
        @{ Value = 'skip'; Label = 'Skip'; Description = ('Keep current mode: {0}' -f (Format-CurrentValue $Config['agentPermissionMode'])) },
        @{ Value = 'default'; Label = 'default'; Description = 'Safer sandboxed behavior.' },
        @{ Value = 'full-access'; Label = 'full-access'; Description = 'Allow broader file and terminal access.' }
    )

    if ($choice -ne 'skip') {
        $Config['agentPermissionMode'] = $choice
    }
}

function Configure-Autostart {
    Write-Section 'Step 7 - Autostart Strategy'

    $currentMode = Get-AutostartMode
    return Select-Option -Title 'Choose how Saki AI should start automatically on Windows login.' -DefaultValue 'skip' -Options @(
        @{ Value = 'skip'; Label = 'Skip'; Description = ('Keep current autostart mode: {0}' -f $currentMode) },
        @{ Value = 'disabled'; Label = 'Disable autostart'; Description = 'Remove startup folder and scheduled task entries.' },
        @{ Value = 'startup-folder'; Label = 'Startup folder'; Description = 'Simple per-user launch on login.' },
        @{ Value = 'scheduled-task'; Label = 'Scheduled task'; Description = 'Create a Windows Task Scheduler entry.' }
    )
}

function Apply-Autostart([string]$Choice) {
    switch ($Choice) {
        'disabled' { Remove-AutostartEntries }
        'startup-folder' { Set-StartupFolderAutostart }
        'scheduled-task' { Set-ScheduledTaskAutostart }
    }
}

$defaultConfig = Read-JsonHashtable -Path $ExampleConfigPath -Required
$currentConfig = Read-JsonHashtable -Path $ConfigPath
$config = Merge-Hashtable -Base $defaultConfig -Overlay $currentConfig

Write-Section 'Saki AI Configuration Wizard'
Write-Host 'This wizard updates data/global_config.json and can also set Windows autostart.'
Write-Host 'Every step supports Skip. Inside text prompts, Enter keeps the current value and - clears it.'

if ($script:WizardWarnings.Count -gt 0) {
    Write-Host ''
    foreach ($warning in $script:WizardWarnings) {
        Write-Host ("Warning: {0}" -f $warning)
    }
}

Configure-Provider -Config $config
Configure-Search -Config $config
Configure-Drawing -Config $config
Configure-Tts -Config $config
Configure-QQBot -Config $config
Configure-Permissions -Config $config
$autostartChoice = Configure-Autostart

Write-Section 'Summary'
Write-Host ("Provider: {0}" -f (Format-CurrentValue $config['provider']))
Write-Host ("Model: {0}" -f (Format-CurrentValue $config['model']))
Write-Host ("Search Engine: {0}" -f (Format-CurrentValue $config['searchEngine']))
Write-Host ("Drawing Provider: {0}" -f (Format-CurrentValue $config['drawingProvider']))
Write-Host ("TTS Provider: {0}" -f (Format-CurrentValue $config['ttsProvider']))
Write-Host ("QQ Bot Enabled: {0}" -f (Format-CurrentValue ([bool](Get-NestedValue $config @('thirdPartyChats', 'qqbot', 'enabled') $false))))
Write-Host ("Permission Mode: {0}" -f (Format-CurrentValue $config['agentPermissionMode']))
Write-Host ("Autostart Change: {0}" -f $autostartChoice)

if (-not (Prompt-Bool -Label 'Save these changes now?' -CurrentValue $true)) {
    Write-Host 'No changes were written.'
    exit 0
}

Save-Config -Config $config
if ($autostartChoice -ne 'skip') {
    Apply-Autostart -Choice $autostartChoice
}

Write-Section 'Done'
Write-Host ("Config saved to: {0}" -f $ConfigPath)
Write-Host ("Autostart mode now: {0}" -f (Get-AutostartMode))
foreach ($warning in $script:WizardWarnings) {
    Write-Host ("Note: {0}" -f $warning)
}
