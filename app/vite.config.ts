import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Node 17부터 DNS 순서가 바뀌어서, 기본값으로 두면 IPv6(`[::1]`)에만 붙는
    // 경우가 있다. 그러면 `localhost`는 열리는데 `127.0.0.1`은 연결이 거부된다.
    // 둘 다 열어둔다. 같은 네트워크의 다른 기기에도 보이므로 집에서만 쓴다.
    host: true,
  },
})
