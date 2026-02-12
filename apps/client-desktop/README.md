# SmartAudit Client Desktop

Electron desktop application for workers to connect to remote servers with session recording.

## Features

- 🔐 Supabase authentication
- 🖥️ Server management (add, edit, delete)
- 🔌 Remote desktop connection via Guacamole
- 📹 Automatic session recording
- 📊 Session history and statistics
- ⚙️ Configurable settings

## Development

### Prerequisites

- Node.js 20+
- pnpm 8+
- Running backend server (see `apps/backend`)

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create `.env` file:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start development server:
```bash
pnpm dev
```

The app will open automatically in development mode with hot reload enabled.

## Building

### Build for current platform:
```bash
pnpm build
pnpm package
```

### Build for specific platforms:
```bash
pnpm package:mac    # macOS (.dmg, .zip)
pnpm package:win    # Windows (.exe, portable)
pnpm package:linux  # Linux (.AppImage, .deb)
```

Built packages will be in the `dist/` directory.

## Project Structure

```
apps/client-desktop/
├── src/
│   ├── main/              # Electron main process
│   │   └── index.ts       # Main entry point
│   ├── preload/           # Preload scripts (IPC bridge)
│   │   └── index.ts       # Expose APIs to renderer
│   └── renderer/          # React application
│       ├── components/    # React components
│       ├── pages/         # Page components
│       ├── stores/        # Zustand state stores
│       ├── config/        # Configuration
│       ├── App.tsx        # Main App component
│       └── main.tsx       # React entry point
├── electron.vite.config.ts  # Vite configuration
├── package.json
└── tsconfig.json
```

## Architecture

### Main Process (`src/main/`)

The Electron main process handles:
- Window creation and management
- IPC communication with renderer
- System integration (tray, notifications)
- Secure credential storage

### Preload (`src/preload/`)

The preload script acts as a secure bridge between main and renderer:
- Exposes limited IPC APIs
- Maintains security with contextIsolation
- Type-safe communication

### Renderer (`src/renderer/`)

The React application running in the renderer process:
- User interface
- Supabase authentication
- Server and session management
- Guacamole client integration

## State Management

Using Zustand for lightweight state management:

- **authStore** - Authentication state (user, session)
- **serverStore** - Server list and management
- **sessionStore** - Active session and history

## IPC Communication

### Available APIs (via preload):

```typescript
window.electron.getVersion()     // Get app version
window.electron.getPlatform()    // Get platform (darwin, win32, linux)
window.electron.store.get(key)   // Get from secure store
window.electron.store.set(key, value)  // Set in secure store
window.electron.store.delete(key)      // Delete from secure store
```

## Environment Variables

Create a `.env` file in the project root:

```env
# Backend
VITE_BACKEND_URL=http://localhost:8080
VITE_BACKEND_WS_URL=ws://localhost:8080/ws

# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

## Guacamole Integration

The client connects to remote servers via the Guacamole WebSocket endpoint:

1. User selects server and clicks "Connect"
2. Backend creates session via `/api/sessions`
3. GuacamoleClient component connects to `/ws` endpoint
4. WebSocket handles Guacamole protocol communication
5. Remote desktop is rendered in the browser canvas

### Guacamole Protocol

The client uses the Guacamole protocol for remote desktop:
- Binary WebSocket connection
- Protocol messages: key, mouse, size, sync, etc.
- Display updates rendered on HTML5 canvas

## Security

- Passwords encrypted before storage
- Context isolation enabled
- CSP headers configured
- Secure IPC communication
- Session tokens in memory only

## Keyboard Shortcuts

- `Ctrl/Cmd + Q` - Quit application
- `F11` - Toggle fullscreen (in session)
- `Esc` - Exit fullscreen

## Troubleshooting

### "Cannot connect to backend"
- Ensure backend is running: `pnpm dev:backend`
- Check `VITE_BACKEND_URL` in `.env`
- Verify CORS is configured for localhost

### "Supabase auth failed"
- Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Verify Supabase project is active
- Check network connectivity

### "Guacamole connection failed"
- Ensure guacd is running: `docker-compose up -d`
- Verify server credentials are correct
- Check server is accessible from backend

## License

Proprietary - SmartAudit
