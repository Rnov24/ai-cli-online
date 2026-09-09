package routes

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type HermesToolParam struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Required    bool   `json:"required"`
	Description string `json:"description"`
	Default     string `json:"default,omitempty"`
}

type HermesToolDef struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Parameters  []HermesToolParam `json:"parameters"`
}

type HermesPluginMetadata struct {
	Name        string          `json:"name"`
	Version     string          `json:"version"`
	Description string          `json:"description"`
	RequiresEnv []string        `json:"requires_env,omitempty"`
	OptionalEnv []string        `json:"optional_env,omitempty"`
	Tools       []HermesToolDef `json:"tools"`
}

type ConvertHermesRequest struct {
	Source     string `json:"source"`     // e.g. "owner/repo", Git URL, or local path
	CustomName string `json:"customName"` // optional custom skill name
	Scope      string `json:"scope"`      // "workspace" or "global"
	Cwd        string `json:"cwd"`
}

// DetectHermesPlugin checks if the given directory is a Hermes plugin by looking
// for plugin.yaml/plugin.yml or tools.py.
func DetectHermesPlugin(dir string) bool {
	if dir == "" {
		return false
	}
	cleanDir := filepath.Clean(dir)

	for _, manifest := range []string{"plugin.yaml", "plugin.yml"} {
		if fi, err := os.Stat(filepath.Join(cleanDir, manifest)); err == nil && !fi.IsDir() {
			return true
		}
	}
	if fi, err := os.Stat(filepath.Join(cleanDir, "tools.py")); err == nil && !fi.IsDir() {
		return true
	}

	// Check 1 level of subdirectories
	entries, err := os.ReadDir(cleanDir)
	if err == nil {
		for _, e := range entries {
			if e.IsDir() {
				sub := filepath.Join(cleanDir, e.Name())
				for _, manifest := range []string{"plugin.yaml", "plugin.yml"} {
					if fi, err := os.Stat(filepath.Join(sub, manifest)); err == nil && !fi.IsDir() {
						return true
					}
				}
				if fi, err := os.Stat(filepath.Join(sub, "tools.py")); err == nil && !fi.IsDir() {
					return true
				}
			}
		}
	}

	return false
}

// FindHermesPluginDir locates the root directory containing the Hermes plugin files.
func FindHermesPluginDir(dir string) string {
	cleanDir := filepath.Clean(dir)
	for _, manifest := range []string{"plugin.yaml", "plugin.yml"} {
		if fi, err := os.Stat(filepath.Join(cleanDir, manifest)); err == nil && !fi.IsDir() {
			return cleanDir
		}
	}
	if fi, err := os.Stat(filepath.Join(cleanDir, "tools.py")); err == nil && !fi.IsDir() {
		return cleanDir
	}

	entries, err := os.ReadDir(cleanDir)
	if err == nil {
		for _, e := range entries {
			if e.IsDir() {
				sub := filepath.Join(cleanDir, e.Name())
				for _, manifest := range []string{"plugin.yaml", "plugin.yml"} {
					if fi, err := os.Stat(filepath.Join(sub, manifest)); err == nil && !fi.IsDir() {
						return sub
					}
				}
				if fi, err := os.Stat(filepath.Join(sub, "tools.py")); err == nil && !fi.IsDir() {
					return sub
				}
			}
		}
	}

	return cleanDir
}

// ParseHermesManifest parses plugin.yaml or plugin.yml line by line.
func ParseHermesManifest(manifestPath string) (name, version, desc string, reqEnv, optEnv []string, err error) {
	file, err := os.Open(manifestPath)
	if err != nil {
		return "", "", "", nil, nil, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	var inDesc bool
	var inReqEnv bool
	var inOptEnv bool
	var descLines []string

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		if inDesc {
			if strings.HasPrefix(line, "  ") || strings.HasPrefix(line, "\t") {
				descLines = append(descLines, strings.TrimSpace(line))
				continue
			}
			inDesc = false
		}

		if inReqEnv {
			if strings.HasPrefix(trimmed, "- ") {
				val := strings.Trim(strings.TrimPrefix(trimmed, "- "), " \"'`")
				if val != "" {
					reqEnv = append(reqEnv, val)
				}
				continue
			}
			if strings.HasPrefix(line, "  ") || strings.HasPrefix(line, "\t") {
				continue
			}
			inReqEnv = false
		}

		if inOptEnv {
			if strings.HasPrefix(trimmed, "- ") {
				val := strings.Trim(strings.TrimPrefix(trimmed, "- "), " \"'`")
				if val != "" {
					optEnv = append(optEnv, val)
				}
				continue
			}
			if strings.HasPrefix(line, "  ") || strings.HasPrefix(line, "\t") {
				continue
			}
			inOptEnv = false
		}

		if strings.HasPrefix(trimmed, "name:") {
			val := strings.TrimSpace(strings.TrimPrefix(trimmed, "name:"))
			name = strings.Trim(val, " \"'`")
		} else if strings.HasPrefix(trimmed, "version:") {
			val := strings.TrimSpace(strings.TrimPrefix(trimmed, "version:"))
			version = strings.Trim(val, " \"'`")
		} else if strings.HasPrefix(trimmed, "description:") {
			val := strings.TrimSpace(strings.TrimPrefix(trimmed, "description:"))
			if val == ">-" || val == ">" || val == "|" || val == "|-" || val == "" {
				inDesc = true
				descLines = nil
			} else {
				desc = strings.Trim(val, " \"'`")
			}
		} else if strings.HasPrefix(trimmed, "requires_env:") {
			val := strings.TrimSpace(strings.TrimPrefix(trimmed, "requires_env:"))
			if strings.HasPrefix(val, "[") && strings.HasSuffix(val, "]") {
				items := strings.Split(strings.Trim(val, "[]"), ",")
				for _, item := range items {
					c := strings.Trim(item, " \"'`\t")
					if c != "" {
						reqEnv = append(reqEnv, c)
					}
				}
			} else {
				inReqEnv = true
			}
		} else if strings.HasPrefix(trimmed, "optional_env:") {
			val := strings.TrimSpace(strings.TrimPrefix(trimmed, "optional_env:"))
			if strings.HasPrefix(val, "[") && strings.HasSuffix(val, "]") {
				items := strings.Split(strings.Trim(val, "[]"), ",")
				for _, item := range items {
					c := strings.Trim(item, " \"'`\t")
					if c != "" {
						optEnv = append(optEnv, c)
					}
				}
			} else {
				inOptEnv = true
			}
		}
	}

	if len(descLines) > 0 {
		desc = strings.Join(descLines, " ")
	}

	return name, version, desc, reqEnv, optEnv, scanner.Err()
}

// normalizePythonType converts Python type annotations to standard friendly types.
func normalizePythonType(pyType string) string {
	clean := strings.TrimSpace(pyType)
	clean = strings.TrimPrefix(clean, "Optional[")
	clean = strings.TrimSuffix(clean, "]")

	switch strings.ToLower(clean) {
	case "str", "string":
		return "string"
	case "int", "integer":
		return "integer"
	case "float", "number":
		return "number"
	case "bool", "boolean":
		return "boolean"
	case "list", "array":
		return "array"
	case "dict", "object", "mapping":
		return "object"
	default:
		if strings.HasPrefix(strings.ToLower(clean), "list[") {
			return "array"
		}
		if strings.HasPrefix(strings.ToLower(clean), "dict[") {
			return "object"
		}
		if clean == "" {
			return "string"
		}
		return clean
	}
}

// inferTypeFromDefault infers type when no type annotation was provided.
func inferTypeFromDefault(defaultVal string) string {
	v := strings.TrimSpace(defaultVal)
	if v == "" {
		return "string"
	}
	if strings.HasPrefix(v, "\"") || strings.HasPrefix(v, "'") {
		return "string"
	}
	if v == "True" || v == "False" || v == "true" || v == "false" {
		return "boolean"
	}
	if strings.HasPrefix(v, "[") {
		return "array"
	}
	if strings.HasPrefix(v, "{") {
		return "object"
	}
	isNum := true
	hasDot := false
	for _, ch := range v {
		if ch == '.' {
			hasDot = true
		} else if ch < '0' || ch > '9' {
			if ch != '-' {
				isNum = false
				break
			}
		}
	}
	if isNum {
		if hasDot {
			return "number"
		}
		return "integer"
	}
	return "string"
}

// parseFunctionParams parses parameter list inside `def func(param1, param2=...):`
func parseFunctionParams(paramsStr string, paramDocs map[string]string) []HermesToolParam {
	var params []HermesToolParam
	if strings.TrimSpace(paramsStr) == "" {
		return params
	}

	// Tokenize parameters while respecting quotes and brackets
	var tokens []string
	var current strings.Builder
	bracketDepth := 0
	inQuote := rune(0)

	for _, r := range paramsStr {
		if inQuote != 0 {
			current.WriteRune(r)
			if r == inQuote {
				inQuote = 0
			}
			continue
		}
		if r == '"' || r == '\'' {
			inQuote = r
			current.WriteRune(r)
			continue
		}
		if r == '(' || r == '[' || r == '{' {
			bracketDepth++
			current.WriteRune(r)
			continue
		}
		if r == ')' || r == ']' || r == '}' {
			if bracketDepth > 0 {
				bracketDepth--
			}
			current.WriteRune(r)
			continue
		}
		if r == ',' && bracketDepth == 0 {
			tokens = append(tokens, strings.TrimSpace(current.String()))
			current.Reset()
			continue
		}
		current.WriteRune(r)
	}
	if current.Len() > 0 {
		tokens = append(tokens, strings.TrimSpace(current.String()))
	}

	for _, token := range tokens {
		t := strings.TrimSpace(token)
		if t == "" || t == "/" || t == "*" {
			continue
		}
		// Ignore *args, **kwargs, self, cls, ctx, context
		if strings.HasPrefix(t, "*") || t == "self" || t == "cls" || t == "ctx" || t == "context" {
			continue
		}

		var pName, pType, pDefault string
		var required bool

		// Check default value: name: type = default OR name = default
		if strings.Contains(t, "=") {
			eqIdx := strings.Index(t, "=")
			pDefault = strings.TrimSpace(t[eqIdx+1:])
			t = strings.TrimSpace(t[:eqIdx])
			required = false
		} else {
			required = true
		}

		// Check type annotation: name: type
		if strings.Contains(t, ":") {
			colonIdx := strings.Index(t, ":")
			pName = strings.TrimSpace(t[:colonIdx])
			pType = normalizePythonType(strings.TrimSpace(t[colonIdx+1:]))
		} else {
			pName = strings.TrimSpace(t)
			if pDefault != "" {
				pType = inferTypeFromDefault(pDefault)
			} else {
				pType = "string"
			}
		}

		// Clean up default quotes
		cleanDefault := pDefault
		if strings.HasPrefix(cleanDefault, "\"") && strings.HasSuffix(cleanDefault, "\"") && len(cleanDefault) >= 2 {
			cleanDefault = cleanDefault[1 : len(cleanDefault)-1]
		} else if strings.HasPrefix(cleanDefault, "'") && strings.HasSuffix(cleanDefault, "'") && len(cleanDefault) >= 2 {
			cleanDefault = cleanDefault[1 : len(cleanDefault)-1]
		}

		pDesc := ""
		if doc, ok := paramDocs[pName]; ok {
			pDesc = doc
		} else {
			pDesc = fmt.Sprintf("Parameter %s", pName)
		}

		params = append(params, HermesToolParam{
			Name:        pName,
			Type:        pType,
			Required:    required,
			Description: pDesc,
			Default:     cleanDefault,
		})
	}

	return params
}

// parseDocstring separates overview and param descriptions from docstring.
func parseDocstring(doc string) (overview string, paramDocs map[string]string) {
	paramDocs = make(map[string]string)
	trimmed := strings.TrimSpace(doc)
	if trimmed == "" {
		return "", paramDocs
	}

	lines := strings.Split(trimmed, "\n")
	var overviewLines []string
	inParams := false

	argRegex := regexp.MustCompile(`^\s*([a-zA-Z0-9_]+)(?:\s*\([^)]*\))?\s*:\s*(.*)$`)
	paramTagRegex := regexp.MustCompile(`^\s*:param\s+([a-zA-Z0-9_]+)\s*:\s*(.*)$`)

	for _, line := range lines {
		l := strings.TrimSpace(line)
		if strings.HasPrefix(l, "Args:") || strings.HasPrefix(l, "Parameters:") || strings.HasPrefix(l, "Arguments:") {
			inParams = true
			continue
		}
		if strings.HasPrefix(l, "Returns:") || strings.HasPrefix(l, "Raises:") || strings.HasPrefix(l, "Example:") {
			inParams = false
			continue
		}

		if inParams {
			if m := argRegex.FindStringSubmatch(line); len(m) == 3 {
				paramDocs[m[1]] = strings.TrimSpace(m[2])
				continue
			}
		}

		if m := paramTagRegex.FindStringSubmatch(line); len(m) == 3 {
			paramDocs[m[1]] = strings.TrimSpace(m[2])
			continue
		}

		if !inParams && !strings.HasPrefix(l, ":") {
			overviewLines = append(overviewLines, l)
		}
	}

	overview = strings.TrimSpace(strings.Join(overviewLines, " "))
	return overview, paramDocs
}

// ExtractPythonTools parses tools.py and optionally schemas.py to extract tool definitions.
func ExtractPythonTools(toolsPyPath, schemasPyPath string) ([]HermesToolDef, error) {
	var tools []HermesToolDef
	toolMap := make(map[string]*HermesToolDef)

	if toolsPyPath != "" {
		content, err := os.ReadFile(toolsPyPath)
		if err == nil {
			src := string(content)
			lines := strings.Split(src, "\n")
			for i := 0; i < len(lines); i++ {
				line := lines[i]
				trimmed := strings.TrimSpace(line)

				if strings.HasPrefix(trimmed, "def ") || strings.HasPrefix(trimmed, "async def ") {
					defLine := trimmed
					// Join multi-line signatures
					for !strings.Contains(defLine, "):") && !strings.Contains(defLine, ") ->") && i+1 < len(lines) {
						i++
						defLine += " " + strings.TrimSpace(lines[i])
					}

					defLine = strings.TrimPrefix(defLine, "async ")
					defLine = strings.TrimPrefix(defLine, "def ")

					parenIdx := strings.Index(defLine, "(")
					if parenIdx == -1 {
						continue
					}
					funcName := strings.TrimSpace(defLine[:parenIdx])
					if strings.HasPrefix(funcName, "_") || funcName == "register" || funcName == "setup" {
						continue
					}

					closeParenIdx := strings.LastIndex(defLine, ")")
					if closeParenIdx == -1 || closeParenIdx <= parenIdx {
						continue
					}
					paramsStr := defLine[parenIdx+1 : closeParenIdx]

					// Extract docstring if present directly after def
					docstring := ""
					docLines := []string{}
					if i+1 < len(lines) {
						nextTrim := strings.TrimSpace(lines[i+1])
						quoteChar := ""
						if strings.HasPrefix(nextTrim, `"""`) {
							quoteChar = `"""`
						} else if strings.HasPrefix(nextTrim, "'''") {
							quoteChar = "'''"
						}

						if quoteChar != "" {
							i++
							contentAfter := strings.TrimPrefix(nextTrim, quoteChar)
							if strings.HasSuffix(contentAfter, quoteChar) && len(contentAfter) >= len(quoteChar) {
								docstring = strings.TrimSuffix(contentAfter, quoteChar)
							} else {
								docLines = append(docLines, contentAfter)
								for i+1 < len(lines) {
									i++
									curLine := lines[i]
									if strings.Contains(curLine, quoteChar) {
										endIdx := strings.Index(curLine, quoteChar)
										docLines = append(docLines, curLine[:endIdx])
										break
									}
									docLines = append(docLines, curLine)
								}
								docstring = strings.Join(docLines, "\n")
							}
						}
					}

					overview, paramDocs := parseDocstring(docstring)
					if overview == "" {
						overview = fmt.Sprintf("Execute %s action", funcName)
					}

					params := parseFunctionParams(paramsStr, paramDocs)

					tDef := HermesToolDef{
						Name:        funcName,
						Description: overview,
						Parameters:  params,
					}
					tools = append(tools, tDef)
					toolMap[funcName] = &tools[len(tools)-1]
				}
			}
		}
	}

	// If schemas.py is present, inspect JSON schemas to enrich metadata
	if schemasPyPath != "" {
		content, err := os.ReadFile(schemasPyPath)
		if err == nil {
			src := string(content)
			// Match JSON-like object dictionaries inside schemas.py
			reTool := regexp.MustCompile(`"name"\s*:\s*"([a-zA-Z0-9_]+)"`)
			reDesc := regexp.MustCompile(`"description"\s*:\s*"([^"]+)"`)
			matches := reTool.FindAllStringSubmatchIndex(src, -1)
			for _, m := range matches {
				name := src[m[2]:m[3]]
				if name == "" || strings.HasPrefix(name, "_") {
					continue
				}
				chunkEnd := len(src)
				if m[1]+1000 < len(src) {
					chunkEnd = m[1] + 1000
				}
				chunk := src[m[0]:chunkEnd]
				desc := ""
				if dm := reDesc.FindStringSubmatch(chunk); len(dm) == 2 {
					desc = dm[1]
				}

				if existing, ok := toolMap[name]; ok {
					if desc != "" && (existing.Description == "" || strings.HasPrefix(existing.Description, "Execute ")) {
						existing.Description = desc
					}
				} else {
					newDef := HermesToolDef{
						Name:        name,
						Description: desc,
						Parameters:  nil,
					}
					tools = append(tools, newDef)
					toolMap[name] = &tools[len(tools)-1]
				}
			}
		}
	}

	return tools, nil
}

// GenerateSkillMarkdown generates structured SKILL.md documentation following AGY standards.
func GenerateSkillMarkdown(meta HermesPluginMetadata) string {
	var sb strings.Builder

	skillName := meta.Name
	if skillName == "" {
		skillName = "hermes-skill"
	}

	desc := meta.Description
	if desc == "" {
		desc = fmt.Sprintf("Converted Hermes Agent plugin skill providing %s tools.", skillName)
	}

	// 1. YAML Frontmatter
	sb.WriteString("---\n")
	sb.WriteString(fmt.Sprintf("name: %s\n", skillName))
	sb.WriteString(fmt.Sprintf("description: >-\n  %s\n", desc))
	sb.WriteString("---\n\n")

	// 2. Title & Overview
	title := strings.ReplaceAll(skillName, "-", " ")
	title = strings.Title(title)
	sb.WriteString(fmt.Sprintf("# %s\n\n", title))
	sb.WriteString(fmt.Sprintf("%s\n\n", desc))

	if meta.Version != "" {
		sb.WriteString(fmt.Sprintf("> **Original Version**: `%s` (Converted from NousResearch Hermes Agent plugin)\n\n", meta.Version))
	}

	// 3. When to Use
	sb.WriteString("## When to Use\n\n")
	sb.WriteString("Use this skill when you need to:\n")
	if len(meta.Tools) > 0 {
		for _, tool := range meta.Tools {
			sb.WriteString(fmt.Sprintf("- Call `%s`: %s\n", tool.Name, tool.Description))
		}
	} else {
		sb.WriteString(fmt.Sprintf("- Perform %s operations using the Hermes integration.\n", skillName))
	}
	sb.WriteString("\n")

	// 4. Environment Requirements
	sb.WriteString("## Environment Requirements\n\n")
	if len(meta.RequiresEnv) > 0 || len(meta.OptionalEnv) > 0 {
		if len(meta.RequiresEnv) > 0 {
			sb.WriteString("**Required Environment Variables**:\n")
			for _, env := range meta.RequiresEnv {
				sb.WriteString(fmt.Sprintf("- `%s`: Required API key or configuration\n", env))
			}
			sb.WriteString("\n")
		}
		if len(meta.OptionalEnv) > 0 {
			sb.WriteString("**Optional Environment Variables**:\n")
			for _, env := range meta.OptionalEnv {
				sb.WriteString(fmt.Sprintf("- `%s`: Optional override\n", env))
			}
			sb.WriteString("\n")
		}
	} else {
		sb.WriteString("No special external environment variables required.\n\n")
	}

	// 5. Available Tools & CLI Commands
	sb.WriteString("## Available Tools & CLI Commands\n\n")
	sb.WriteString("The skill provides a universal zero-touch CLI adapter in `scripts/runner.py`.\n\n")

	if len(meta.Tools) == 0 {
		sb.WriteString("### General Execution\n\n")
		sb.WriteString("```bash\npython3 scripts/runner.py --list\n```\n\n")
	} else {
		for _, tool := range meta.Tools {
			sb.WriteString(fmt.Sprintf("### `%s`\n\n", tool.Name))
			sb.WriteString(fmt.Sprintf("%s\n\n", tool.Description))

			if len(tool.Parameters) > 0 {
				sb.WriteString("| Parameter | Type | Required | Default | Description |\n")
				sb.WriteString("|---|---|---|---|---|\n")
				for _, p := range tool.Parameters {
					reqStr := "No"
					if p.Required {
						reqStr = "Yes"
					}
					defStr := "-"
					if p.Default != "" {
						defStr = fmt.Sprintf("`%s`", p.Default)
					}
					sb.WriteString(fmt.Sprintf("| `%s` | `%s` | %s | %s | %s |\n", p.Name, p.Type, reqStr, defStr, p.Description))
				}
				sb.WriteString("\n")
			}

			// Example invocation
			examplePayload := make(map[string]interface{})
			for _, p := range tool.Parameters {
				if p.Required {
					switch p.Type {
					case "integer", "number":
						examplePayload[p.Name] = 1
					case "boolean":
						examplePayload[p.Name] = true
					case "array":
						examplePayload[p.Name] = []string{"item"}
					case "object":
						examplePayload[p.Name] = map[string]string{"key": "val"}
					default:
						examplePayload[p.Name] = "value"
					}
				} else if p.Default != "" {
					examplePayload[p.Name] = p.Default
				}
			}

			payloadBytes, _ := json.Marshal(examplePayload)
			payloadStr := string(payloadBytes)
			if payloadStr == "" {
				payloadStr = "{}"
			}

			sb.WriteString("**CLI Command**:\n")
			sb.WriteString("```bash\n")
			sb.WriteString(fmt.Sprintf("python3 scripts/runner.py %s '%s'\n", tool.Name, payloadStr))
			sb.WriteString("```\n\n")
		}
	}

	// 6. Execution Instructions for the Agent
	sb.WriteString("## Execution Instructions for the Agent\n\n")
	sb.WriteString("1. Always run tools from the skill root or specify the path to `scripts/runner.py`.\n")
	sb.WriteString("2. Pass parameters as a single valid JSON string payload argument.\n")
	sb.WriteString("3. Ensure any required environment variables listed above are present before invocation.\n")
	sb.WriteString("4. Parse the standard JSON response emitted on standard output.\n")

	return sb.String()
}

// InjectUniversalRunner creates scripts/runner.py with mode 0755.
func InjectUniversalRunner(scriptsDir string) error {
	if err := os.MkdirAll(scriptsDir, 0755); err != nil {
		return fmt.Errorf("failed to create scripts dir: %w", err)
	}

	runnerPath := filepath.Join(scriptsDir, "runner.py")

	runnerCode := `#!/usr/bin/env python3
"""
Universal CLI Adapter for Hermes Agent Plugin tools in AGY Online.
Automatically generated by AGY Hermes Plugin Converter.
"""
import sys
import os
import json
import inspect
import asyncio

# Ensure current script directory is on sys.path
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

try:
    import tools
except ImportError as e:
    print(json.dumps({"error": f"Failed to import tools.py: {e}"}))
    sys.exit(1)

def list_tools():
    available = []
    for name, func in inspect.getmembers(tools, inspect.isfunction):
        if name.startswith("_") or name in ("register", "setup"):
            continue
        sig = str(inspect.signature(func))
        doc = (inspect.getdoc(func) or "").strip()
        available.append({"name": name, "signature": sig, "doc": doc})
    print(json.dumps({"tools": available}, indent=2))

def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(f"Usage: python3 {os.path.basename(__file__)} <tool_name> [json_payload|--list]")
        sys.exit(0)

    tool_name = sys.argv[1]
    if tool_name == "--list":
        list_tools()
        sys.exit(0)

    if not hasattr(tools, tool_name):
        print(json.dumps({"error": f"Tool '{tool_name}' not found in tools.py"}))
        sys.exit(1)

    func = getattr(tools, tool_name)
    if not callable(func):
        print(json.dumps({"error": f"'{tool_name}' is not callable"}))
        sys.exit(1)

    payload = {}
    if len(sys.argv) >= 3:
        raw_arg = sys.argv[2].strip()
        if raw_arg:
            try:
                payload = json.loads(raw_arg)
            except json.JSONDecodeError as e:
                print(json.dumps({"error": f"Invalid JSON payload: {e}"}))
                sys.exit(1)
    elif not sys.stdin.isatty():
        try:
            stdin_data = sys.stdin.read().strip()
            if stdin_data:
                payload = json.loads(stdin_data)
        except Exception as e:
            print(json.dumps({"error": f"Failed to read JSON from stdin: {e}"}))
            sys.exit(1)

    if not isinstance(payload, dict):
        print(json.dumps({"error": "Payload must be a JSON object (dictionary)"}))
        sys.exit(1)

    try:
        if inspect.iscoroutinefunction(func):
            result = asyncio.run(func(**payload))
        else:
            result = func(**payload)

        if isinstance(result, (dict, list, int, float, bool)):
            print(json.dumps(result, indent=2, default=str))
        elif result is None:
            print(json.dumps({"ok": True}))
        else:
            print(str(result))
    except Exception as err:
        print(json.dumps({"error": str(err), "tool": tool_name}))
        sys.exit(1)

if __name__ == "__main__":
    main()
`

	if err := os.WriteFile(runnerPath, []byte(runnerCode), 0755); err != nil {
		return fmt.Errorf("failed to write runner.py: %w", err)
	}
	// Explicit chmod in case umask restricted it
	_ = os.Chmod(runnerPath, 0755)

	return nil
}

// ConvertHermesDirectory converts a source Hermes directory into an AGY Agent Skill.
func ConvertHermesDirectory(sourceDir, targetDir, skillName string, meta HermesPluginMetadata) error {
	scriptsDir := filepath.Join(targetDir, "scripts")
	if err := os.MkdirAll(scriptsDir, 0755); err != nil {
		return fmt.Errorf("failed to create target scripts dir: %w", err)
	}

	// 1. Generate and write SKILL.md
	skillMdContent := GenerateSkillMarkdown(meta)
	skillMdPath := filepath.Join(targetDir, "SKILL.md")
	if err := os.WriteFile(skillMdPath, []byte(skillMdContent), 0644); err != nil {
		return fmt.Errorf("failed to write SKILL.md: %w", err)
	}

	// 2. Inject universal runner.py
	if err := InjectUniversalRunner(scriptsDir); err != nil {
		return fmt.Errorf("failed to inject runner: %w", err)
	}

	// 3. Copy Python files and requirements.txt to scripts/
	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return fmt.Errorf("failed to read source dir: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasSuffix(name, ".py") || name == "requirements.txt" {
			srcFile := filepath.Join(sourceDir, name)
			dstFile := filepath.Join(scriptsDir, name)

			in, err := os.Open(srcFile)
			if err != nil {
				continue
			}
			out, err := os.OpenFile(dstFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
			if err != nil {
				in.Close()
				continue
			}
			_, _ = io.Copy(out, in)
			in.Close()
			out.Close()
		}
	}

	return nil
}
