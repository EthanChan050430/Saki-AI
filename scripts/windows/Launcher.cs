using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;

internal static class Launcher
{
    private static Process server;
    private static int Main(string[] args)
    {
        try
        {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string port = Environment.GetEnvironmentVariable("SAKI_PORT") ?? "5480";
            bool openBrowser = true;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--no-browser") openBrowser = false;
                else if (args[i] == "--port" && i + 1 < args.Length) port = args[++i];
                else throw new ArgumentException("Usage: Saki-AI.exe [--no-browser] [--port NUMBER]");
            }
            int number;
            if (!int.TryParse(port, out number) || number < 1 || number > 65535) throw new ArgumentException("Invalid port");
            string data = Environment.GetEnvironmentVariable("SAKI_DATA_DIR");
            if (string.IsNullOrEmpty(data)) data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Saki-AI", "data");
            Directory.CreateDirectory(data);
            string url = "http://127.0.0.1:" + port;
            var info = new ProcessStartInfo(Path.Combine(root, "runtime", "node.exe"), "--max-old-space-size=768 \"" + Path.Combine(root, "backend", "server.js") + "\"");
            info.WorkingDirectory = root;
            info.UseShellExecute = false;
            info.EnvironmentVariables["NODE_ENV"] = "production";
            info.EnvironmentVariables["SAKI_PROFILE"] = "light";
            info.EnvironmentVariables["PORT"] = port;
            info.EnvironmentVariables["SAKI_DATA_DIR"] = Path.GetFullPath(data);
            info.EnvironmentVariables["SAKI_FRONTEND_DIST"] = Path.Combine(root, "frontend", "dist");
            info.EnvironmentVariables["AGENT_HOST"] = "127.0.0.1";
            Console.WriteLine("Saki AI 3.0 | " + url + " | Ctrl+C to stop");
            Console.WriteLine("Data: " + data);
            server = Process.Start(info);
            Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) { e.Cancel = true; Stop(); };
            AppDomain.CurrentDomain.ProcessExit += delegate { Stop(); };
            if (openBrowser) Task.Run(async delegate
            {
                using (var client = new HttpClient(new HttpClientHandler { UseProxy = false }))
                {
                    client.Timeout = TimeSpan.FromSeconds(2);
                    for (int i = 0; i < 60 && !server.HasExited; i++)
                    {
                        try
                        {
                            string health = await client.GetStringAsync(url + "/api/health");
                            if (health.Contains("\"pid\":" + server.Id) || health.Contains("\"pid\": " + server.Id))
                            {
                                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                                return;
                            }
                        }
                        catch { }
                        await Task.Delay(1000);
                    }
                }
            });
            server.WaitForExit();
            return server.ExitCode;
        }
        catch (Exception error) { Console.Error.WriteLine("[Saki] " + error.Message); return 1; }
    }
    private static void Stop()
    {
        try { if (server != null && !server.HasExited) server.Kill(); } catch { }
    }
}