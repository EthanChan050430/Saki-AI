Option Explicit

Dim fileSystem
Dim shell
Dim scriptDir
Dim startScript

Set fileSystem = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fileSystem.GetParentFolderName(WScript.ScriptFullName)
startScript = fileSystem.BuildPath(scriptDir, "start.bat")

If Not fileSystem.FileExists(startScript) Then
  MsgBox "start.bat was not found next to start-hidden.vbs.", 16, "Saki AI"
  WScript.Quit 1
End If

shell.CurrentDirectory = scriptDir
shell.Run Chr(34) & startScript & Chr(34), 0, False
