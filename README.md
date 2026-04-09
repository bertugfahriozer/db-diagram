# DB Diagram — Visual Database Designer & ERD

> Design, edit, and explore database schemas visually in VS Code.

## 🚀 Features

### 📊 Diagram View

| Feature | Description |
|---------|----------|
| **Live Connection** | Connects directly to MySQL databases |
| **Schema Visualization** | Automatically renders all tables, columns, types, and PK/FK badges |
| **3 Layout Modes** | 📊 Hierarchical, ❄️ Snowflake, 📦 Compact |
| **Drag & Drop** | Move tables freely |
| **Pan & Zoom** | Pan with mouse, zoom with scroll (20%–300%) |
| **Fit to View** | Fit all tables to the screen with a single click |
| **PNG Export** | Save the diagram as PNG |

### ✏️ Editing

| Feature | Description |
|---------|----------|
| **Add Table** | Create new tables with a visual form |
| **Add Column** | Right-click → Add Column (type, nullable, default, position) |
| **Add Relationship** | Visual FK builder — select from/to table and column |
| **Deletion** | Delete Table / Column / FK via right-click menu |
| **Raw SQL** | Execute any DDL command |

### 🔍 Search & Filtering

| Feature | Description |
|---------|----------|
| **Table Search** | Filter by table name |
| **Column Search** | Filter by column name or type |
| **Type Filter** | Filter by INT, VARCHAR, TEXT, JSON, etc. |

### 📝 Notes & History

| Feature | Description |
|---------|----------|
| **Table Notes** | Add notes to each table, view on hover |
| **Snapshot History** | Save and restore schema snapshots |
| **Schema Diff** | Compare differences between two snapshots |

### 📦 Migration Export

| Format | Description |
|--------|----------|
| **SQL** | ALTER TABLE commands |
| **Prisma** | Prisma Schema |
| **TypeORM** | TypeORM Entities |

---

## 📋 Requirements

- VS Code 1.75+
- MySQL 5.7+ or MariaDB 10.3+

---

## 🚀 Quick Start

### 1. Installation

```bash
cd db-diagram-designer
npm install
```

### 2. Compilation

```bash
npm run compile
# or watch mode:
npm run watch
```

### 3. Running

Press **F5** in VS Code to open the Extension Development Host.

### 4. Connection

Open the Command Palette (`Cmd+Shift+P`) and run:

```
DB Diagram: Connect to Database
```

Enter your connection details (5 steps: host → port → user → password → database).

### 5. Opening the Diagram

The diagram opens automatically after connecting. Alternatively:

```
DB Diagram: Open Diagram
```

---

## 📖 Usage

### Toolbar
| Button | Action |
|-------|---------|
| `＋ Table` | Opens the table creation form |
| `⟷ Relation` | Opens the FK relationship builder |
| `⊞ Query` | Opens the Query Builder |
| `⌨ SQL` | Execute DDL commands |
| `📷` | Export as PNG |
| `📦` | Migration export |
| `🕐` | Snapshot history |
| `⊕` | Schema Diff |
| `⊡` | Fit to view |
| `↻` | Refresh schema |

### Layout Modes
| Mode | Description |
|-----|----------|
| 📊 **Hierarchical** | Level-based arrangement based on FK relationships |
| ❄️ **Snowflake** | Most connected table in the center, others around it |
| 📦 **Compact** | Tight grid layout, for tables with few relationships |

### Canvas Interactions
| Interaction | Action |
|-----------|---------|
| **Drag table header** | Move the table |
| **Scroll** | Zoom in/out |
| **Drag empty space** | Pan the canvas |
| **Right-click → table header** | Table actions menu |
| **Right-click → column** | Column deletion option |
| **Right-click → FK line** | Relationship deletion option |
| **Click table** | Select (border highlighted) |
| **Hover on 📝 icon** | View note |

---

## 🏗️ Architecture

```
db-diagram-designer/
├── src/
│   ├── extension.ts              # Entry point, command registrations
│   ├── db/
│   │   ├── DatabaseManager.ts    # Database connection manager
│   │   ├── MySQLDatabase.ts      # MySQL implementation
│   │   ├── PostgreSQLDatabase.ts # PostgreSQL implementation
│   │   └── types.ts              # Type definitions
│   ├── panels/
│   │   ├── ConnectionPanel.ts    # Connection form webview
│   │   └── DiagramPanel.ts       # Diagram webview panel
│   ├── providers/
│   │   └── ConnectionsProvider.ts # Sidebar TreeView
│   └── managers/
│       ├── SnapshotManager.ts    # Snapshot management
│       ├── SchemaDiffManager.ts  # Schema comparison
│       └── MigrationManager.ts   # Migration code generation
├── media/
│   └── diagram.html              # Diagram webview HTML
├── package.json                  # Extension manifest
└── tsconfig.json
```

---

## ⚡ Performance

This extension includes performance optimizations:

- **Lazy Loading**: Renders only when needed
- **Collision Avoidance**: Tables are placed with automatic collision prevention
- **Efficient Updates**: Only changed parts are re-rendered
- **Memory Management**: Memory is cleared when webview is disposed

---

## 🔒 Security

- Passwords are **never saved** — only host/port/user/database are stored in `globalState`
- Webview uses **CSP nonce** — inline scripts won't run without a nonce
- All SQL identifiers are protected with backticks

---

## 📝 License

MIT
