import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

let host = false; // Default: localhost only
try {
  const configPath = path.resolve(__dirname, '../data/global_config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.remoteAccess) {
      host = '0.0.0.0';
    }
  }
} catch (e) {
  console.warn('Could not read global_config.json for host setting, defaulting to localhost');
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: host, 
    port: 3003,      // 指定端口
    strictPort: false // 如果端口被占用，自动尝试下一个
  }
})

