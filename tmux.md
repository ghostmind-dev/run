# Tmux Layout Guide

The **Tmux Layout System** provides an intuitive and powerful way to create complex tmux layouts using hierarchical configuration. Think of it as building blocks where you define how to split space and what goes in each section.

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
