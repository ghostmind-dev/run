# Tmux Layout Guide

The **Tmux Layout System** provides two powerful ways to create tmux layouts:

1. **Grid Layout** - Simplified predefined arrangements (recommended for most use cases)
2. **Section Layout** - Hierarchical configuration for complex custom layouts

## Grid Layout (Recommended)

Grid layouts provide predefined, easy-to-use window arrangements. Simply choose a grid type and define your panes - the system handles all the splitting logic automatically.

### Available Grid Types

- **`single`** - Single pane (1 pane)
- **`vertical`** - Two panes split left/right (2 panes)
- **`horizontal`** - Two panes split top/bottom (2 panes)
- **`two-by-two`** - Four panes in 2x2 grid (4 panes)
- **`main-side`** - One large pane (66%) on left, two stacked panes (34%) on right (3 panes)

### Basic Grid Structure

```json
{
  "layout": "grid",
  "grid": {
    "type": "vertical",
    "panes": [
      {
        "name": "left",
        "command": "nvim"
      },
      {
        "name": "right",
        "command": "npm run dev"
      }
    ]
  }
}
```

### Auto-Fill Feature

Grid layouts support **auto-fill** - you don't need to define all panes. Missing panes are automatically created with default names (`pane-0`, `pane-1`, etc.).

```json
{
  "layout": "grid",
  "grid": {
    "type": "two-by-two",
    "panes": [
      {
        "name": "api",
        "command": "npm start"
      },
      {
        "name": "db",
        "command": "docker-compose up"
      }
      // Auto-fills pane-2 and pane-3
    ]
  }
}
```

### Grid Layout Examples

#### Single Pane
```json
{
  "name": "main-window",
  "layout": "grid",
  "grid": {
    "type": "single",
    "panes": [
      {
        "name": "terminal"
      }
    ]
  }
}
```

#### Vertical Split (Side-by-Side)
```json
{
  "name": "dev-window",
  "layout": "grid",
  "grid": {
    "type": "vertical",
    "panes": [
      {
        "name": "editor",
        "command": "nvim"
      },
      {
        "name": "terminal",
        "command": "npm run dev"
      }
    ]
  }
}
```

#### Horizontal Split (Top/Bottom)
```json
{
  "name": "logs-window",
  "layout": "grid",
  "grid": {
    "type": "horizontal",
    "panes": [
      {
        "name": "app-logs",
        "command": "tail -f logs/app.log"
      },
      {
        "name": "error-logs",
        "command": "tail -f logs/error.log"
      }
    ]
  }
}
```

#### Two-by-Two Grid
```json
{
  "name": "monitoring",
  "layout": "grid",
  "grid": {
    "type": "two-by-two",
    "panes": [
      {
        "name": "top-left",
        "command": "htop"
      },
      {
        "name": "top-right",
        "command": "docker stats"
      },
      {
        "name": "bottom-left",
        "command": "tail -f logs/access.log"
      },
      {
        "name": "bottom-right",
        "command": "tail -f logs/error.log"
      }
    ]
  }
}
```

Layout:
```
┌─────────────┬─────────────┐
│  top-left   │  top-right  │
│             │             │
├─────────────┼─────────────┤
│ bottom-left │bottom-right │
│             │             │
└─────────────┴─────────────┘
```

#### Main-Side Layout
```json
{
  "name": "ide-window",
  "layout": "grid",
  "grid": {
    "type": "main-side",
    "panes": [
      {
        "name": "editor",
        "command": "nvim"
      },
      {
        "name": "terminal",
        "command": "bash"
      },
      {
        "name": "logs",
        "command": "tail -f logs/dev.log"
      }
    ]
  }
}
```

Layout:
```
┌──────────────────┬──────────┐
│                  │ terminal │
│                  ├──────────┤
│     editor       │   logs   │
│                  │          │
└──────────────────┴──────────┘
```

---

## Section Layout (Advanced)

The **Section Layout System** provides an intuitive and powerful way to create complex custom tmux layouts using hierarchical configuration. Think of it as building blocks where you define how to split space and what goes in each section.

## Core Concepts

### Sections

A **section** defines how to split space and contains **items**. Every section has:

- `split`: Direction to split (`"horizontal"` or `"vertical"`)
- `items`: Array of panes or nested sections
- `size`: Optional size specification (e.g., `"50%"`, `"30"`)

### Items

**Items** are what go inside sections. They can be:

- **Panes**: Terminal windows with commands
- **Sections**: Nested sections with their own split and items

## Basic Structure

```json
{
  "layout": "sections",
  "section": {
    "split": "vertical",
    "items": [
      {
        "name": "left-pane",
        "command": "echo 'Left Side'",
        "size": "30%"
      },
      {
        "name": "right-pane",
        "command": "echo 'Right Side'",
        "size": "70%"
      }
    ]
  }
}
```

**Required Properties:**

- `layout`: Must be `"sections"`
- `section`: The root section defining your layout

## Split Directions

- **`"vertical"`**: Split left/right (creates columns)
- **`"horizontal"`**: Split top/bottom (creates rows)

## Pane Configuration

Each pane supports:

```json
{
  "name": "unique-pane-name",
  "command": "echo 'Hello World'",
  "path": "relative/path/from/session/root",
  "sshTarget": "user@hostname",
  "size": "50%"
}
```

### Properties

- **`name`** (required): Unique identifier for the pane
- **`command`**: Command to execute when pane starts
- **`path`**: Starting directory (relative to session root)
- **`sshTarget`**: SSH target for remote execution
- **`size`**: Size of this pane within its parent section

## Size Specifications

Sizes can be specified as:

- **Percentage**: `"50%"`, `"33%"`, `"25%"`
- **Absolute**: `"30"`, `"20"` (tmux units)

**Important**: Sizes should add up to 100% within each section for best results.

## Layout Examples

### Simple Two-Pane Split

```json
{
  "layout": "sections",
  "section": {
    "split": "vertical",
    "items": [
      {
        "name": "editor",
        "command": "nvim",
        "size": "70%"
      },
      {
        "name": "terminal",
        "command": "bash",
        "size": "30%"
      }
    ]
  }
}
```

### Three-Pane Horizontal Stack

```json
{
  "layout": "sections",
  "section": {
    "split": "horizontal",
    "items": [
      {
        "name": "top",
        "command": "htop",
        "size": "33%"
      },
      {
        "name": "middle",
        "command": "tail -f /var/log/app.log",
        "size": "33%"
      },
      {
        "name": "bottom",
        "command": "bash",
        "size": "34%"
      }
    ]
  }
}
```

### Nested Sections Example

```json
{
  "layout": "sections",
  "section": {
    "split": "vertical",
    "items": [
      {
        "name": "sidebar",
        "command": "ranger",
        "size": "25%"
      },
      {
        "split": "horizontal",
        "size": "75%",
        "items": [
          {
            "name": "editor",
            "command": "nvim",
            "size": "70%"
          },
          {
            "split": "vertical",
            "size": "30%",
            "items": [
              {
                "name": "terminal",
                "command": "bash",
                "size": "50%"
              },
              {
                "name": "logs",
                "command": "tail -f logs/app.log",
                "size": "50%"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

This creates:

```
┌─────────┬───────────────────────────┐
│         │                           │
│ sidebar │         editor            │
│         │                           │
│         ├─────────────┬─────────────┤
│         │   terminal  │    logs     │
│         │             │             │
└─────────┴─────────────┴─────────────┘
```

### IDE-Style Layout

```json
{
  "layout": "sections",
  "section": {
    "split": "horizontal",
    "items": [
      {
        "split": "vertical",
        "size": "80%",
        "items": [
          {
            "name": "file-explorer",
            "command": "ranger",
            "size": "20%"
          },
          {
            "name": "editor",
            "command": "nvim .",
            "size": "60%"
          },
          {
            "name": "preview",
            "command": "echo 'Preview Pane'",
            "size": "20%"
          }
        ]
      },
      {
        "split": "vertical",
        "size": "20%",
        "items": [
          {
            "name": "terminal",
            "command": "bash",
            "size": "50%"
          },
          {
            "name": "logs",
            "command": "tail -f logs/development.log",
            "size": "50%"
          }
        ]
      }
    ]
  }
}
```

### Development Environment

```json
{
  "layout": "sections",
  "section": {
    "split": "vertical",
    "items": [
      {
        "split": "horizontal",
        "size": "70%",
        "items": [
          {
            "name": "editor",
            "command": "nvim",
            "path": "src",
            "size": "70%"
          },
          {
            "split": "vertical",
            "size": "30%",
            "items": [
              {
                "name": "server",
                "command": "npm run dev",
                "size": "50%"
              },
              {
                "name": "tests",
                "command": "npm run test:watch",
                "size": "50%"
              }
            ]
          }
        ]
      },
      {
        "split": "horizontal",
        "size": "30%",
        "items": [
          {
            "name": "git",
            "command": "git status",
            "size": "50%"
          },
          {
            "name": "terminal",
            "command": "bash",
            "size": "50%"
          }
        ]
      }
    ]
  }
}
```

## Remote Development with SSH

```json
{
  "layout": "sections",
  "section": {
    "split": "vertical",
    "items": [
      {
        "name": "local-terminal",
        "command": "bash",
        "size": "50%"
      },
      {
        "split": "horizontal",
        "size": "50%",
        "items": [
          {
            "name": "remote-editor",
            "command": "nvim",
            "sshTarget": "user@server.com",
            "path": "/var/www/app",
            "size": "70%"
          },
          {
            "name": "remote-logs",
            "command": "tail -f /var/log/nginx/access.log",
            "sshTarget": "user@server.com",
            "size": "30%"
          }
        ]
      }
    ]
  }
}
```

## Design Principles

### 1. Hierarchical Thinking

Structure your layout like a tree:

- Root section defines the main split
- Each item can be a pane (leaf) or another section (branch)
- Nest as deeply as needed

### 2. Size Planning

- Start with major sections (e.g., 70% editor, 30% tools)
- Then subdivide sections as needed
- Ensure sizes add up to 100% in each section

### 3. Logical Grouping

- Group related functionality in the same section
- Use nested sections to create zones
- Keep frequently used panes easily accessible

## Common Patterns

### Two-Column Layout

```json
{
  "split": "vertical",
  "items": [
    { "name": "left", "size": "50%" },
    { "name": "right", "size": "50%" }
  ]
}
```

### Three-Row Layout

```json
{
  "split": "horizontal",
  "items": [
    { "name": "top", "size": "33%" },
    { "name": "middle", "size": "33%" },
    { "name": "bottom", "size": "34%" }
  ]
}
```

### Sidebar + Main Area

```json
{
  "split": "vertical",
  "items": [
    { "name": "sidebar", "size": "25%" },
    { "name": "main", "size": "75%" }
  ]
}
```

### Header + Body + Footer

```json
{
  "split": "horizontal",
  "items": [
    { "name": "header", "size": "10%" },
    { "name": "body", "size": "80%" },
    { "name": "footer", "size": "10%" }
  ]
}
```

## Best Practices

1. **Start Simple**: Begin with basic splits, then add complexity
2. **Use Meaningful Names**: Make pane names descriptive
3. **Plan Your Sizes**: Sketch the layout before coding
4. **Test Iteratively**: Use `tmux init <session>` to test changes
5. **Consider Workflows**: Design around how you actually work
6. **Document Complex Layouts**: Add comments explaining the structure

## Troubleshooting

### Layout Not As Expected

- Check that splits are correct (`horizontal` vs `vertical`)
- Verify sizes add up to 100%
- Ensure proper nesting structure

### Panes Too Small

- Adjust size percentages
- Consider removing nested levels
- Test on target terminal size

### Commands Not Running

- Check `command` syntax
- Verify `path` exists
- Test `sshTarget` connectivity

## Complete Working Examples

The examples above demonstrate real-world configuration patterns for:

- Development environments
- System monitoring setups
- Remote administration layouts
- Multi-project workflows

---

## Choosing Between Grid and Section Layouts

### Use Grid Layout When:

✅ You need a standard arrangement (1, 2, 3, or 4 panes)
✅ You want simplicity and quick setup
✅ You don't need custom split ratios
✅ You're new to tmux configuration

**Example**: Most development workflows fit perfectly into grid layouts.

### Use Section Layout When:

✅ You need custom split ratios (e.g., 70/30, 25/75)
✅ You need more than 4 panes
✅ You need complex nested arrangements
✅ You need precise control over layout structure

**Example**: IDE-style layouts with file explorer, editor, terminal, and multiple monitoring panes.

### Recommendation

Start with **Grid Layout** for 90% of use cases. Only switch to Section Layout when you need the additional flexibility and control.

---

## Complete Session Configuration Example

### Using Grid Layouts

```json
{
  "tmux": {
    "sessions": [
      {
        "name": "dev",
        "windows": [
          {
            "name": "editor",
            "layout": "grid",
            "grid": {
              "type": "vertical",
              "panes": [
                {
                  "name": "nvim",
                  "command": "nvim"
                },
                {
                  "name": "terminal"
                }
              ]
            }
          },
          {
            "name": "servers",
            "layout": "grid",
            "grid": {
              "type": "two-by-two",
              "panes": [
                {
                  "name": "api",
                  "command": "npm run dev:api"
                },
                {
                  "name": "web",
                  "command": "npm run dev:web"
                },
                {
                  "name": "db",
                  "command": "docker-compose up postgres"
                },
                {
                  "name": "redis",
                  "command": "docker-compose up redis"
                }
              ]
            }
          },
          {
            "name": "monitoring",
            "layout": "grid",
            "grid": {
              "type": "main-side",
              "panes": [
                {
                  "name": "logs",
                  "command": "tail -f logs/development.log"
                },
                {
                  "name": "htop",
                  "command": "htop"
                },
                {
                  "name": "docker",
                  "command": "docker stats"
                }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

### Mixing Grid and Section Layouts

You can use both layout types in the same session:

```json
{
  "tmux": {
    "sessions": [
      {
        "name": "mixed",
        "windows": [
          {
            "name": "simple",
            "layout": "grid",
            "grid": {
              "type": "vertical",
              "panes": [
                {"name": "left"},
                {"name": "right"}
              ]
            }
          },
          {
            "name": "complex",
            "layout": "sections",
            "section": {
              "split": "vertical",
              "items": [
                {
                  "name": "sidebar",
                  "size": "20%"
                },
                {
                  "split": "horizontal",
                  "size": "80%",
                  "items": [
                    {"name": "main", "size": "70%"},
                    {"name": "footer", "size": "30%"}
                  ]
                }
              ]
            }
          }
        ]
      }
    ]
  }
}
```
