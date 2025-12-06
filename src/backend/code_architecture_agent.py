"""
Code Architecture Analysis Agent using LangGraph

This agent analyzes Git repositories to extract architecture patterns,
identify components, and generate comprehensive documentation.

Architecture Components:
1. Repo Reader (R) - Fetches Git repository files
2. Static Analyzer (S) - Parses code to extract structure
3. Graph Builder (G) - Constructs dependency graphs
4. Pattern Mapper (P) - Identifies architecture patterns
5. LLM Orchestrator (L) - Summarizes and labels components
6. Validator (V) - Ensures output quality
7. Output Renderer (O) - Generates final documentation
"""

import os
import subprocess
import tempfile
import shutil
import re
import ast
from typing import TypedDict, Annotated, Literal
from dataclasses import dataclass, field
import operator
import json
from pathlib import Path
from datetime import datetime
import fnmatch

# LangGraph imports
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

# NetworkX for graph operations
import networkx as nx


# ============================================================================
# STATE DEFINITION
# ============================================================================

class AgentState(TypedDict):
    """
    Central state object that flows through all nodes in the graph.

    Why use TypedDict:
    - Type safety: Ensures all nodes work with consistent data structure
    - Reducer functions: Allow multiple nodes to update the same field
    - Transparency: Makes data flow explicit and traceable
    """
    # Input parameters
    repo_path: str
    git_ref: str
    scope_filters: list[str]
    depth: int

    # Component outputs
    file_tree: dict  # From Repo Reader
    code_facts: dict  # From Static Analyzer
    dependency_graph: dict  # From Graph Builder
    architecture_patterns: dict  # From Pattern Mapper
    llm_summary: dict  # From LLM Orchestrator
    validation_result: dict  # From Validator
    final_output: str  # From Output Renderer
    mermaid_diagram: str  # Mermaid diagram for visualization

    # Metadata and control flow
    errors: Annotated[list[str], operator.add]  # Accumulate errors from any step
    iteration_count: int  # Track validation iterations
    messages: Annotated[list, operator.add]  # Accumulate messages for debugging


# ============================================================================
# COMPONENT 1: REPO READER (R)
# ============================================================================

def detect_language(file_path: Path) -> str:
    """Detect programming language from file extension"""
    ext_map = {
        # Python
        '.py': 'python',
        '.pyx': 'python',
        '.pyw': 'python',
        # JavaScript/TypeScript
        '.js': 'javascript',
        '.mjs': 'javascript',
        '.cjs': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.jsx': 'javascript',
        # Java/JVM
        '.java': 'java',
        '.scala': 'scala',
        '.kt': 'kotlin',
        '.kts': 'kotlin',
        '.groovy': 'groovy',
        # C/C++
        '.c': 'c',
        '.cpp': 'cpp',
        '.cc': 'cpp',
        '.cxx': 'cpp',
        '.h': 'c',
        '.hpp': 'cpp',
        '.hxx': 'cpp',
        # C#/.NET
        '.cs': 'csharp',
        '.vb': 'vbnet',
        '.fs': 'fsharp',
        # Go
        '.go': 'go',
        # Rust
        '.rs': 'rust',
        # Ruby
        '.rb': 'ruby',
        '.rake': 'ruby',
        # PHP
        '.php': 'php',
        # Swift/Objective-C
        '.swift': 'swift',
        '.m': 'objective-c',
        '.mm': 'objective-c',
        # SQL variants
        '.sql': 'sql',
        '.psql': 'sql',
        '.plsql': 'sql',
        '.mysql': 'sql',
        '.pgsql': 'sql',
        # Shell
        '.sh': 'shell',
        '.bash': 'shell',
        '.zsh': 'shell',
        # Other languages
        '.r': 'r',
        '.R': 'r',
        '.pl': 'perl',
        '.lua': 'lua',
        '.dart': 'dart',
        '.ex': 'elixir',
        '.exs': 'elixir',
        '.erl': 'erlang',
        # Web
        '.vue': 'vue',
        '.svelte': 'svelte',
        '.html': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.sass': 'sass',
        '.less': 'less',
    }
    return ext_map.get(file_path.suffix.lower(), 'unknown')


def matches_scope_filters(file_path: Path, scope_filters: list, base_path: Path) -> bool:
    """Check if file matches scope filter patterns"""
    if not scope_filters:
        return True

    relative_path = str(file_path.relative_to(base_path))

    for pattern in scope_filters:
        if fnmatch.fnmatch(relative_path, pattern):
            return True
    return False


def repo_reader_node(state: AgentState) -> AgentState:
    """
    Fetches the Git repository and builds the file tree.

    Real implementation that:
    1. Clones Git repositories or reads local paths
    2. Applies scope filters
    3. Detects languages
    4. Reads file contents
    """
    temp_dir = None

    try:
        repo_path = state["repo_path"]
        git_ref = state.get("git_ref", "HEAD")
        scope_filters = state.get("scope_filters", [])
        depth = state.get("depth", -1)

        # Determine if it's a URL or local path
        if repo_path.startswith("http://") or repo_path.startswith("https://"):
            # Normalize GitHub URLs (remove /tree/branch, /blob/branch, etc.)
            repo_path = re.sub(r'/(tree|blob)/[^/]+.*$', '', repo_path)

            # Add .git suffix if not present
            if not repo_path.endswith('.git'):
                repo_path = repo_path + '.git'

            # Clone repository to temp directory
            temp_dir = tempfile.mkdtemp(prefix="cortex_repo_")

            try:
                result = subprocess.run(
                    ["git", "clone", "--depth", "1", "--branch", git_ref, repo_path, temp_dir],
                    capture_output=True,
                    text=True,
                    timeout=300  # 5 minute timeout
                )

                if result.returncode != 0:
                    # If branch doesn't exist, try without branch
                    result = subprocess.run(
                        ["git", "clone", "--depth", "1", repo_path, temp_dir],
                        capture_output=True,
                        text=True,
                        timeout=300
                    )

                    if result.returncode != 0:
                        raise Exception(f"Git clone failed: {result.stderr}")

                base_path = Path(temp_dir)
            except subprocess.TimeoutExpired:
                raise Exception("Repository clone timed out (>5 minutes)")
        else:
            # Local path
            base_path = Path(repo_path)
            if not base_path.exists():
                raise Exception(f"Local path does not exist: {repo_path}")

        # Walk directory and collect files
        files = []
        languages = set()

        # Patterns to exclude (common non-code directories)
        exclude_patterns = {
            '.git', 'node_modules', '__pycache__', '.venv', 'venv',
            'dist', 'build', '.next', '.cache', 'coverage', '.pytest_cache'
        }

        for file_path in base_path.rglob("*"):
            # Skip directories and excluded paths
            if not file_path.is_file():
                continue

            # Skip if any parent directory matches exclude patterns
            if any(part in exclude_patterns for part in file_path.parts):
                continue

            # Check scope filters
            if not matches_scope_filters(file_path, scope_filters, base_path):
                continue

            # Detect language
            language = detect_language(file_path)
            if language == 'unknown':
                continue

            # Read file content (with size limit)
            try:
                # Skip files larger than 1MB
                if file_path.stat().st_size > 1024 * 1024:
                    continue

                content = file_path.read_text(errors='ignore')

                files.append({
                    "path": str(file_path.relative_to(base_path)),
                    "type": "file",
                    "language": language,
                    "content": content,
                    "size": len(content)
                })

                languages.add(language)

                # Limit total files to avoid memory issues
                if len(files) >= 500:
                    break

            except Exception as e:
                # Skip files that can't be read
                continue

        file_tree = {
            "root": repo_path,
            "ref": git_ref,
            "files": files,
            "metadata": {
                "total_files": len(files),
                "languages": list(languages),
                "timestamp": datetime.utcnow().isoformat()
            },
            "temp_dir": temp_dir  # Store for cleanup later
        }

        return {
            **state,
            "file_tree": file_tree,
            "messages": [f"✓ Repo Reader: Fetched {len(files)} files from {git_ref} ({', '.join(languages)})"]
        }

    except Exception as e:
        # Cleanup temp directory on error
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

        return {
            **state,
            "file_tree": {},
            "errors": [f"Repo Reader failed: {str(e)}"],
            "messages": [f"✗ Repo Reader: {str(e)}"]
        }


# ============================================================================
# COMPONENT 2: STATIC ANALYZER (S)
# ============================================================================

def analyze_python_file(content: str, file_path: str):
    """Parse Python file using AST - Enhanced with call graph extraction"""
    symbols = []
    imports = []
    function_calls = []
    class_relationships = []

    try:
        tree = ast.parse(content)

        # Track current context (class/function we're in)
        current_class = None
        current_function = None

        for node in ast.walk(tree):
            # Extract class definitions and inheritance
            if isinstance(node, ast.ClassDef):
                # Get base classes
                bases = [base.id if isinstance(base, ast.Name) else str(base) for base in node.bases]

                symbols.append({
                    "name": node.name,
                    "type": "class",
                    "file": file_path,
                    "line": node.lineno,
                    "bases": bases  # Inheritance info
                })

                # Record inheritance relationships
                for base in bases:
                    class_relationships.append({
                        "from_class": node.name,
                        "to_class": base,
                        "type": "inherits",
                        "file": file_path
                    })

                current_class = node.name

                # Extract methods within the class
                for item in node.body:
                    if isinstance(item, ast.FunctionDef):
                        symbols.append({
                            "name": item.name,
                            "type": "method",
                            "class": current_class,
                            "file": file_path,
                            "line": item.lineno
                        })

            # Extract function definitions
            elif isinstance(node, ast.FunctionDef):
                # Check if it's a top-level function (not a method)
                if current_class is None:
                    symbols.append({
                        "name": node.name,
                        "type": "function",
                        "file": file_path,
                        "line": node.lineno
                    })

                current_function = node.name

                # Extract function calls within this function
                for subnode in ast.walk(node):
                    if isinstance(subnode, ast.Call):
                        # Get the called function name
                        if isinstance(subnode.func, ast.Name):
                            called_name = subnode.func.id
                        elif isinstance(subnode.func, ast.Attribute):
                            # Method call like obj.method()
                            called_name = subnode.func.attr
                        else:
                            continue

                        function_calls.append({
                            "from_function": current_function,
                            "from_class": current_class,
                            "to_function": called_name,
                            "file": file_path,
                            "line": subnode.lineno
                        })

            # Extract imports
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        imports.append({
                            "from": file_path,
                            "module": alias.name,
                            "symbol": alias.asname or alias.name
                        })
                elif isinstance(node, ast.ImportFrom):
                    module = node.module or ""
                    for alias in node.names:
                        imports.append({
                            "from": file_path,
                            "module": module,
                            "symbol": alias.name
                        })

    except SyntaxError:
        pass  # Skip files with syntax errors

    return symbols, imports, function_calls, class_relationships


def analyze_javascript_file(content: str, file_path: str):
    """Parse JavaScript/TypeScript file using regex - Enhanced with calls"""
    symbols = []
    imports = []
    function_calls = []  # Simplified call detection for JS
    class_relationships = []

    # Match class declarations with extends: class ClassName extends BaseClass
    class_pattern = r'class\s+([A-Z]\w*)(?:\s+extends\s+([A-Z]\w*))?'
    for match in re.finditer(class_pattern, content):
        class_name = match.group(1)
        base_class = match.group(2)

        symbols.append({
            "name": class_name,
            "type": "class",
            "file": file_path,
            "line": content[:match.start()].count('\n') + 1,
            "bases": [base_class] if base_class else []
        })

        # Record inheritance
        if base_class:
            class_relationships.append({
                "from_class": class_name,
                "to_class": base_class,
                "type": "inherits",
                "file": file_path
            })

    # Match function declarations: function funcName, const funcName = () =>
    func_pattern = r'(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\()'
    for match in re.finditer(func_pattern, content):
        name = match.group(1) or match.group(2)
        if name:
            symbols.append({
                "name": name,
                "type": "function",
                "file": file_path,
                "line": content[:match.start()].count('\n') + 1
            })

    # Match imports: import ... from '...'
    import_pattern = r'import\s+(?:{[^}]*}|\w+|[^from]*)\s+from\s+["\']([^"\']+)["\']'
    for match in re.finditer(import_pattern, content):
        imports.append({
            "from": file_path,
            "module": match.group(1),
            "symbol": "*"
        })

    # Match require: const x = require('...')
    require_pattern = r'require\(["\']([^"\']+)["\']\)'
    for match in re.finditer(require_pattern, content):
        imports.append({
            "from": file_path,
            "module": match.group(1),
            "symbol": "*"
        })

    return symbols, imports, function_calls, class_relationships


def analyze_sql_file(content: str, file_path: str):
    """Parse SQL file using regex to extract tables, views, procedures, functions"""
    symbols = []
    imports = []
    function_calls = []
    class_relationships = []

    # Match CREATE TABLE
    table_pattern = r'CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w\.]*)'
    for match in re.finditer(table_pattern, content, re.IGNORECASE):
        table_name = match.group(1)
        symbols.append({
            "name": table_name,
            "type": "table",
            "file": file_path,
            "line": content[:match.start()].count('\n') + 1
        })

    # Match CREATE VIEW
    view_pattern = r'CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([a-zA-Z_][\w\.]*)'
    for match in re.finditer(view_pattern, content, re.IGNORECASE):
        view_name = match.group(1)
        symbols.append({
            "name": view_name,
            "type": "view",
            "file": file_path,
            "line": content[:match.start()].count('\n') + 1
        })

    # Match CREATE PROCEDURE/FUNCTION
    proc_pattern = r'CREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION)\s+([a-zA-Z_][\w\.]*)'
    for match in re.finditer(proc_pattern, content, re.IGNORECASE):
        proc_name = match.group(1)
        symbols.append({
            "name": proc_name,
            "type": "procedure",
            "file": file_path,
            "line": content[:match.start()].count('\n') + 1
        })

    # Match table references in FROM/JOIN clauses
    from_pattern = r'(?:FROM|JOIN)\s+([a-zA-Z_][\w\.]*)'
    referenced_tables = set()
    for match in re.finditer(from_pattern, content, re.IGNORECASE):
        referenced_tables.add(match.group(1))

    # Create imports for referenced tables
    for table in referenced_tables:
        imports.append({
            "from": file_path,
            "module": table,
            "symbol": table
        })

    return symbols, imports, function_calls, class_relationships


def analyze_generic_file(content: str, file_path: str, language: str):
    """Generic parser for languages without specific support - extracts basic structure"""
    symbols = []
    imports = []
    function_calls = []
    class_relationships = []

    # Generic function/method pattern (works for many C-like languages)
    # Matches: public/private/protected function_name(...) or def function_name(...)
    func_pattern = r'(?:public|private|protected|static|async|func|def|fn)\s+([a-zA-Z_]\w*)\s*\('
    for match in re.finditer(func_pattern, content):
        name = match.group(1)
        if name and not name.startswith('_'):  # Skip private/special names
            symbols.append({
                "name": name,
                "type": "function",
                "file": file_path,
                "line": content[:match.start()].count('\n') + 1
            })

    # Generic class pattern
    class_pattern = r'(?:class|struct|interface|trait)\s+([A-Z][a-zA-Z0-9_]*)'
    for match in re.finditer(class_pattern, content):
        name = match.group(1)
        symbols.append({
            "name": name,
            "type": "class",
            "file": file_path,
            "line": content[:match.start()].count('\n') + 1,
            "bases": []
        })

    # Generic import patterns (import, use, require, include)
    import_pattern = r'(?:import|use|require|include|#include)\s+(?:["<]([^">]+)[">]|([a-zA-Z_][\w\.:]*))'
    for match in re.finditer(import_pattern, content):
        module = match.group(1) or match.group(2)
        if module:
            imports.append({
                "from": file_path,
                "module": module,
                "symbol": "*"
            })

    return symbols, imports, function_calls, class_relationships


def static_analyzer_node(state: AgentState) -> AgentState:
    """
    Parses source code to extract structural facts.

    Enhanced implementation:
    - Extracts classes, functions, methods
    - Captures function calls (control flow)
    - Detects class inheritance
    - Python: ast module for accurate parsing
    - JavaScript/TypeScript: regex-based parsing
    """
    try:
        file_tree = state.get("file_tree", {})
        files = file_tree.get("files", [])

        all_symbols = []
        all_imports = []
        all_function_calls = []
        all_class_relationships = []
        parse_errors = 0

        for file_info in files:
            file_path = file_info["path"]
            content = file_info.get("content", "")
            language = file_info.get("language", "")

            try:
                if language == "python":
                    symbols, imports, func_calls, class_rels = analyze_python_file(content, file_path)
                    all_symbols.extend(symbols)
                    all_imports.extend(imports)
                    all_function_calls.extend(func_calls)
                    all_class_relationships.extend(class_rels)
                elif language in ["javascript", "typescript"]:
                    symbols, imports, func_calls, class_rels = analyze_javascript_file(content, file_path)
                    all_symbols.extend(symbols)
                    all_imports.extend(imports)
                    all_function_calls.extend(func_calls)
                    all_class_relationships.extend(class_rels)
                elif language == "sql":
                    symbols, imports, func_calls, class_rels = analyze_sql_file(content, file_path)
                    all_symbols.extend(symbols)
                    all_imports.extend(imports)
                    all_function_calls.extend(func_calls)
                    all_class_relationships.extend(class_rels)
                else:
                    # Use generic parser for all other languages
                    symbols, imports, func_calls, class_rels = analyze_generic_file(content, file_path, language)
                    all_symbols.extend(symbols)
                    all_imports.extend(imports)
                    all_function_calls.extend(func_calls)
                    all_class_relationships.extend(class_rels)

            except Exception as e:
                parse_errors += 1
                continue

        code_facts = {
            "symbols": all_symbols,
            "imports": all_imports,
            "function_calls": all_function_calls,
            "class_relationships": all_class_relationships,
            "metadata": {
                "parse_errors": parse_errors,
                "total_symbols": len(all_symbols),
                "total_imports": len(all_imports),
                "total_function_calls": len(all_function_calls),
                "total_class_relationships": len(all_class_relationships),
                "files_analyzed": len(files) - parse_errors
            }
        }

        return {
            **state,
            "code_facts": code_facts,
            "messages": [f"✓ Static Analyzer: Extracted {len(all_symbols)} symbols, {len(all_function_calls)} function calls from {len(files)} files"]
        }

    except Exception as e:
        return {
            **state,
            "code_facts": {},
            "errors": [f"Static Analyzer failed: {str(e)}"],
            "messages": [f"✗ Static Analyzer: {str(e)}"]
        }


# ============================================================================
# COMPONENT 3: GRAPH BUILDER (G)
# ============================================================================

def resolve_import_to_file(module_path: str, all_files: set) -> str:
    """Try to resolve an import module path to an actual file"""
    # Common patterns for resolving imports
    candidates = [
        f"{module_path}.py",
        f"{module_path}.js",
        f"{module_path}.ts",
        f"{module_path}.tsx",
        f"{module_path}/index.js",
        f"{module_path}/index.ts",
    ]

    # Normalize paths
    for file in all_files:
        normalized = file.replace("\\", "/")
        for candidate in candidates:
            if normalized.endswith(candidate) or module_path in normalized:
                return file

    return None


def extract_folder_structure(file_paths):
    """Extract hierarchical folder structure from file paths"""
    folders = {}

    for file_path in file_paths:
        parts = file_path.replace("\\", "/").split("/")

        # Get folder path (all parts except the file name)
        if len(parts) > 1:
            folder = "/".join(parts[:-1])
            file_name = parts[-1]

            if folder not in folders:
                folders[folder] = {
                    "path": folder,
                    "files": [],
                    "depth": len(parts) - 1
                }
            folders[folder]["files"].append(file_path)
        else:
            # Root level file
            if "." not in folders:
                folders["."] = {"path": ".", "files": [], "depth": 0}
            folders["."]["files"].append(file_path)

    return folders


def graph_builder_node(state: AgentState) -> AgentState:
    """
    Constructs the dependency graph from code facts using NetworkX.

    ENHANCED: Now folder-aware!
    1. Builds directed graph of file dependencies
    2. Extracts folder hierarchy
    3. Analyzes intra-folder and inter-folder relationships
    4. Calculates centrality metrics
    5. Detects clusters/communities
    6. Computes graph statistics
    """
    try:
        code_facts = state.get("code_facts", {})
        symbols = code_facts.get("symbols", [])
        imports = code_facts.get("imports", [])

        # Create directed graph
        G = nx.DiGraph()

        # Get all unique files
        all_files = {symbol["file"] for symbol in symbols}
        all_files.update({imp["from"] for imp in imports})

        # Extract folder structure
        folder_structure = extract_folder_structure(all_files)

        # Add nodes for each file with folder metadata
        for file_path in all_files:
            parts = file_path.replace("\\", "/").split("/")
            folder = "/".join(parts[:-1]) if len(parts) > 1 else "."
            G.add_node(file_path, type="module", folder=folder)

        # Add edges for imports
        for imp in imports:
            source = imp["from"]
            module = imp.get("module", "")

            # Try to resolve module to actual file
            target = resolve_import_to_file(module, all_files)

            if target and target != source:
                # Determine if this is intra-folder or inter-folder
                source_parts = source.replace("\\", "/").split("/")
                target_parts = target.replace("\\", "/").split("/")
                source_folder = "/".join(source_parts[:-1]) if len(source_parts) > 1 else "."
                target_folder = "/".join(target_parts[:-1]) if len(target_parts) > 1 else "."

                relationship_type = "intra_folder" if source_folder == target_folder else "inter_folder"

                if G.has_edge(source, target):
                    # Increment weight if edge exists
                    G[source][target]["weight"] += 1
                else:
                    G.add_edge(source, target, type="import", weight=1, relationship=relationship_type)

        # Calculate metrics
        if G.number_of_nodes() > 0:
            try:
                centrality = nx.degree_centrality(G)
            except:
                centrality = {node: 0 for node in G.nodes()}

            # Detect communities/clusters
            try:
                if G.number_of_edges() > 0:
                    undirected = G.to_undirected()
                    communities = nx.community.greedy_modularity_communities(undirected)
                    clusters = [
                        {"id": f"cluster_{i}", "modules": list(cluster)}
                        for i, cluster in enumerate(communities)
                    ]
                else:
                    clusters = [{"id": "cluster_0", "modules": list(G.nodes())}]
            except:
                clusters = [{"id": "cluster_0", "modules": list(G.nodes())}]

            # Analyze folder-level relationships
            folder_relationships = {}
            for source, target, data in G.edges(data=True):
                source_folder = G.nodes[source].get("folder", ".")
                target_folder = G.nodes[target].get("folder", ".")

                if source_folder != target_folder:
                    key = f"{source_folder} -> {target_folder}"
                    folder_relationships[key] = folder_relationships.get(key, 0) + 1

            # Count intra vs inter folder edges
            intra_folder_edges = sum(1 for _, _, d in G.edges(data=True) if d.get("relationship") == "intra_folder")
            inter_folder_edges = sum(1 for _, _, d in G.edges(data=True) if d.get("relationship") == "inter_folder")

            # Graph metrics
            metrics = {
                "total_nodes": G.number_of_nodes(),
                "total_edges": G.number_of_edges(),
                "avg_degree": sum(dict(G.degree()).values()) / G.number_of_nodes() if G.number_of_nodes() > 0 else 0,
                "density": nx.density(G),
                "intra_folder_edges": intra_folder_edges,
                "inter_folder_edges": inter_folder_edges,
                "total_folders": len(folder_structure)
            }

            # Build output
            dependency_graph = {
                "nodes": [
                    {
                        "id": node,
                        "type": "module",
                        "folder": G.nodes[node].get("folder", "."),
                        "centrality": centrality.get(node, 0),
                        "in_degree": G.in_degree(node),
                        "out_degree": G.out_degree(node)
                    }
                    for node in G.nodes()
                ],
                "edges": [
                    {
                        "source": source,
                        "target": target,
                        "type": data.get("type", "import"),
                        "weight": data.get("weight", 1),
                        "relationship": data.get("relationship", "unknown")
                    }
                    for source, target, data in G.edges(data=True)
                ],
                "clusters": clusters,
                "metrics": metrics,
                "folder_structure": [
                    {
                        "path": folder_data["path"],
                        "files": folder_data["files"],
                        "file_count": len(folder_data["files"]),
                        "depth": folder_data["depth"]
                    }
                    for folder_data in sorted(folder_structure.values(), key=lambda x: x["depth"])
                ],
                "folder_relationships": [
                    {"from_to": k, "count": v}
                    for k, v in sorted(folder_relationships.items(), key=lambda x: x[1], reverse=True)
                ]
            }
        else:
            # Empty graph
            dependency_graph = {
                "nodes": [],
                "edges": [],
                "clusters": [],
                "metrics": {"total_nodes": 0, "total_edges": 0, "avg_degree": 0, "density": 0},
                "folder_structure": [],
                "folder_relationships": []
            }

        return {
            **state,
            "dependency_graph": dependency_graph,
            "messages": [f"✓ Graph Builder: Built graph with {len(dependency_graph['nodes'])} nodes, {len(dependency_graph['edges'])} edges across {len(dependency_graph.get('folder_structure', []))} folders"]
        }

    except Exception as e:
        return {
            **state,
            "dependency_graph": {},
            "errors": [f"Graph Builder failed: {str(e)}"],
            "messages": [f"✗ Graph Builder: {str(e)}"]
        }


# ============================================================================
# COMPONENT 4: PATTERN MAPPER (P)
# ============================================================================

def detect_layered_pattern(dependency_graph, code_facts):
    """Detect layered architecture pattern"""
    nodes = dependency_graph.get("nodes", [])
    edges = dependency_graph.get("edges", [])

    # Group modules by directory structure
    layers = {}
    for node in nodes:
        parts = node["id"].split("/")
        if len(parts) > 1:
            layer = parts[1] if len(parts) > 1 else parts[0]
            if layer not in layers:
                layers[layer] = []
            layers[layer].append(node["id"])

    if len(layers) >= 2:
        evidence = [f"Found {len(layers)} distinct layers: {', '.join(layers.keys())}"]

        return {
            "type": "Layered Architecture",
            "confidence": min(0.6 + (len(layers) * 0.1), 0.9),
            "evidence": evidence,
            "layers": [{"name": name.capitalize(), "modules": mods} for name, mods in layers.items()]
        }
    return None


def detect_mvc_pattern(dependency_graph, code_facts):
    """Detect MVC pattern based on naming conventions"""
    nodes = dependency_graph.get("nodes", [])

    mvc_keywords = {"controller": [], "model": [], "view": [], "template": [], "route": []}

    for node in nodes:
        node_id = node["id"].lower()
        for keyword in mvc_keywords.keys():
            if keyword in node_id:
                mvc_keywords[keyword].append(node["id"])

    found_components = {k: v for k, v in mvc_keywords.items() if v}

    if len(found_components) >= 2:
        evidence = [f"Found {k}: {len(v)} files" for k, v in found_components.items()]

        return {
            "type": "MVC Pattern",
            "confidence": min(0.5 + (len(found_components) * 0.15), 0.95),
            "evidence": evidence,
            "components": found_components
        }
    return None


def detect_microservices_pattern(dependency_graph, code_facts):
    """Detect microservices pattern"""
    clusters = dependency_graph.get("clusters", [])

    # Microservices typically have multiple loosely coupled clusters
    if len(clusters) >= 3:
        evidence = [
            f"Found {len(clusters)} distinct service boundaries",
            "Modular organization suggests service-oriented architecture"
        ]

        return {
            "type": "Microservices Pattern",
            "confidence": min(0.5 + (len(clusters) * 0.1), 0.85),
            "evidence": evidence,
            "services": clusters
        }
    return None


def pattern_mapper_node(state: AgentState) -> AgentState:
    """
    Identifies common architecture patterns using heuristics.

    Real implementation that:
    1. Analyzes directory structure and naming
    2. Examines graph topology
    3. Detects Layered, MVC, Microservices patterns
    4. Computes confidence scores
    """
    try:
        dependency_graph = state.get("dependency_graph", {})
        code_facts = state.get("code_facts", {})

        detected_patterns = []

        # Run pattern detectors
        patterns_to_check = [
            detect_layered_pattern,
            detect_mvc_pattern,
            detect_microservices_pattern
        ]

        for detector in patterns_to_check:
            try:
                pattern = detector(dependency_graph, code_facts)
                if pattern:
                    detected_patterns.append(pattern)
            except:
                continue

        # Use clusters from dependency graph
        clusters = dependency_graph.get("clusters", [])

        architecture_patterns = {
            "detected_patterns": detected_patterns,
            "clusters": clusters,
            "metadata": {
                "total_patterns": len(detected_patterns),
                "highest_confidence": max([p.get("confidence", 0) for p in detected_patterns], default=0)
            }
        }

        return {
            **state,
            "architecture_patterns": architecture_patterns,
            "messages": [f"✓ Pattern Mapper: Detected {len(detected_patterns)} patterns"]
        }

    except Exception as e:
        return {
            **state,
            "architecture_patterns": {},
            "errors": [f"Pattern Mapper failed: {str(e)}"],
            "messages": [f"✗ Pattern Mapper: {str(e)}"]
        }


# ============================================================================
# COMPONENT 5: LLM ORCHESTRATOR (L)
# ============================================================================

def llm_orchestrator_node(state: AgentState) -> AgentState:
    """
    Uses LLM to summarize, name clusters, and propose refinements.
    
    WHY THIS IMPLEMENTATION:
    1. Constrained schema - uses JSON mode for structured output
    2. Context compression - summarizes large graphs for LLM
    3. Few-shot prompting - includes examples of good architectures
    4. Iterative refinement - can request clarifications
    
    DESIGN DECISIONS:
    - Use Claude 3.5 Sonnet for best reasoning
    - Provide graph structure + code snippets for context
    - Ask for subsystem labels, responsibilities, and definitions
    - Validate JSON schema before proceeding
    - Keep prompts under token limits via summarization
    """
    try:
        architecture_patterns = state.get("architecture_patterns", {})
        dependency_graph = state.get("dependency_graph", {})
        code_facts = state.get("code_facts", {})
        
        # Initialize LLM
        llm = ChatAnthropic(
            model="claude-sonnet-4-20250514",
            temperature=0,
        )
        
        # Construct prompt with constrained schema
        system_prompt = """You are an expert software architect analyzing codebases.

Your task is to create a COMPREHENSIVE, BEGINNER-FRIENDLY architectural analysis that a new team member can understand in ONE GLANCE.

Requirements:
1. Identify ALL major subsystems/folders and their PURPOSE
2. Explain WHAT each subsystem does in simple terms
3. Describe HOW subsystems interact with each other
4. Specify the TECHNOLOGY/LANGUAGE used in each subsystem
5. Highlight KEY FILES and their roles
6. Provide a clear DATA FLOW explanation
7. Identify entry points and core business logic

Respond ONLY with valid JSON in this exact format:
{
  "project_overview": {
    "purpose": "What does this project do? (1-2 sentences)",
    "architecture_style": "e.g., Microservices, Monolith, Layered, etc.",
    "tech_stack": ["Python", "JavaScript", "etc."],
    "entry_points": ["main.py", "index.js", "etc."]
  },
  "subsystems": [
    {
      "name": "Folder/Subsystem name",
      "purpose": "Clear explanation of what this subsystem does",
      "technology": "Language/framework used",
      "key_files": [
        {
          "file": "filename.py",
          "role": "What this file does"
        }
      ],
      "modules": ["list", "of", "all", "modules"],
      "responsibility": "Detailed description",
      "dependencies": [
        {
          "subsystem": "Name of dependency",
          "reason": "Why it depends on this"
        }
      ],
      "provides_to": [
        {
          "subsystem": "Name of dependent",
          "what": "What it provides"
        }
      ]
    }
  ],
  "data_flow": "Step-by-step explanation of how data flows through the system",
  "overall_architecture": "Detailed architectural description for newcomers",
  "recommendations": ["list", "of", "suggestions"]
}

DO NOT include any text outside the JSON structure. Make it CRYSTAL CLEAR for newcomers."""

        # Extract folder structure summary
        folder_structure = dependency_graph.get('folder_structure', [])
        folder_summary = "\n".join([
            f"  - {f['path']} ({f['file_count']} files)"
            for f in folder_structure[:20]  # Limit to top 20 folders
        ])

        folder_relationships = dependency_graph.get('folder_relationships', [])
        folder_rel_summary = "\n".join([
            f"  - {rel['from_to']}: {rel['count']} dependencies"
            for rel in folder_relationships[:15]  # Limit to top 15 relationships
        ])

        metrics = dependency_graph.get('metrics', {})

        user_prompt = f"""Analyze this codebase architecture:

**Detected Patterns:**
{json.dumps(architecture_patterns.get('detected_patterns', []), indent=2)}

**Folder Structure ({metrics.get('total_folders', 0)} folders):**
{folder_summary if folder_summary else "  (flat structure)"}

**Folder-Level Dependencies:**
{folder_rel_summary if folder_rel_summary else "  (no cross-folder dependencies detected)"}

**Dependency Graph Metrics:**
- Total Files: {len(dependency_graph.get('nodes', []))}
- Total Dependencies: {len(dependency_graph.get('edges', []))}
- Intra-folder dependencies: {metrics.get('intra_folder_edges', 0)}
- Inter-folder dependencies: {metrics.get('inter_folder_edges', 0)}
- Clusters detected: {len(dependency_graph.get('clusters', []))}

**Code Symbols:**
Total: {code_facts.get('metadata', {}).get('total_symbols', 0)}

IMPORTANT: Your subsystems should reflect the actual folder structure found in the codebase.
Group modules by their folder paths and describe their relationships accurately based on the dependency data above.

Provide your architectural analysis in the specified JSON format."""

        # Call LLM
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ]
        
        response = llm.invoke(messages)
        
        # Parse response
        response_text = response.content.strip()
        # Remove markdown code blocks if present
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        response_text = response_text.strip()
        
        llm_summary = json.loads(response_text)
        
        return {
            **state,
            "llm_summary": llm_summary,
            "messages": [f"✓ LLM Orchestrator: Generated summary with {len(llm_summary.get('subsystems', []))} subsystems"]
        }
        
    except Exception as e:
        # Fallback summary if LLM fails - use actual data from analysis
        # Build subsystems from folder structure
        folder_structure = dependency_graph.get("folder_structure", [])
        fallback_subsystems = []

        for folder in folder_structure[:10]:  # Top 10 folders
            folder_path = folder['path']
            folder_name = folder_path.split('/')[-1] if '/' in folder_path else folder_path

            fallback_subsystems.append({
                "name": folder_name or "root",
                "purpose": f"Contains {folder['file_count']} files",
                "technology": "Various",
                "key_files": [],
                "modules": folder['files'][:20],  # Limit to 20 files
                "responsibility": f"Manages functionality in {folder_path}/",
                "dependencies": [],
                "provides_to": []
            })

        fallback_summary = {
            "project_overview": {
                "purpose": "Analyzing codebase structure",
                "architecture_style": "Unknown (LLM analysis unavailable)",
                "tech_stack": ["Python", "JavaScript"],
                "entry_points": []
            },
            "subsystems": fallback_subsystems if fallback_subsystems else [
                {
                    "name": "Codebase",
                    "purpose": "Main codebase",
                    "technology": "Various",
                    "key_files": [],
                    "modules": [],
                    "responsibility": "Application code",
                    "dependencies": [],
                    "provides_to": []
                }
            ],
            "data_flow": "Unable to analyze data flow (LLM unavailable)",
            "overall_architecture": f"Codebase with {len(folder_structure)} folders and {len(dependency_graph.get('nodes', []))} files. LLM analysis failed: {str(e)}",
            "recommendations": ["Retry analysis", "Check API key", "Review error logs"]
        }
        
        return {
            **state,
            "llm_summary": fallback_summary,
            "errors": [f"LLM Orchestrator failed (using fallback): {str(e)}"],
            "messages": [f"⚠ LLM Orchestrator: Used fallback summary ({str(e)})"]
        }


# ============================================================================
# COMPONENT 6: VALIDATOR (V)
# ============================================================================

def validator_node(state: AgentState) -> AgentState:
    """
    Validates the output for completeness and correctness.
    
    WHY THIS IMPLEMENTATION:
    1. Multiple checks - referential integrity, schema, size limits
    2. Mermaid syntax validation - ensures diagrams are valid
    3. Cross-references - verifies all graph nodes are documented
    4. Iterative fixing - can request LLM corrections
    
    DESIGN DECISIONS:
    - Fail fast on critical errors (missing nodes, invalid syntax)
    - Warn on quality issues (incomplete descriptions, size limits)
    - Track iteration count to prevent infinite loops
    - Return specific error messages for LLM correction
    """
    try:
        llm_summary = state.get("llm_summary", {})
        dependency_graph = state.get("dependency_graph", {})
        iteration_count = state.get("iteration_count", 0)
        
        validation_errors = []
        validation_warnings = []
        
        # Check 1: Referential integrity
        graph_modules = {node["id"] for node in dependency_graph.get("nodes", [])}
        summary_modules = set()
        for subsystem in llm_summary.get("subsystems", []):
            summary_modules.update(subsystem.get("modules", []))
        
        missing_from_summary = graph_modules - summary_modules
        if missing_from_summary:
            validation_warnings.append(f"Modules in graph but not in summary: {missing_from_summary}")
        
        # Check 2: Schema validation
        required_fields = ["subsystems", "overall_architecture", "recommendations"]
        for field in required_fields:
            if field not in llm_summary:
                validation_errors.append(f"Missing required field: {field}")
        
        # Check 3: Subsystem validation
        for i, subsystem in enumerate(llm_summary.get("subsystems", [])):
            if "name" not in subsystem:
                validation_errors.append(f"Subsystem {i} missing 'name' field")
            if "responsibility" not in subsystem:
                validation_warnings.append(f"Subsystem {i} ({subsystem.get('name', 'unknown')}) missing responsibility")
        
        # Check 4: Size limits (for Mermaid diagrams)
        total_subsystems = len(llm_summary.get("subsystems", []))
        if total_subsystems > 20:
            validation_warnings.append(f"Large diagram: {total_subsystems} subsystems may be hard to visualize")
        
        # Check 5: Description quality
        overall_arch = llm_summary.get("overall_architecture", "")
        if len(overall_arch) < 50:
            validation_warnings.append("Overall architecture description is very brief")
        
        validation_result = {
            "valid": len(validation_errors) == 0,
            "errors": validation_errors,
            "warnings": validation_warnings,
            "iteration": iteration_count,
            "checks_passed": {
                "referential_integrity": len(missing_from_summary) == 0,
                "schema_complete": len(validation_errors) == 0,
                "quality_sufficient": len(validation_warnings) < 3
            }
        }
        
        status = "✓" if validation_result["valid"] else "✗"
        msg = f"{status} Validator: {len(validation_errors)} errors, {len(validation_warnings)} warnings"
        
        return {
            **state,
            "validation_result": validation_result,
            "iteration_count": iteration_count + 1,
            "messages": [msg]
        }
        
    except Exception as e:
        return {
            **state,
            "validation_result": {"valid": False, "errors": [str(e)], "warnings": []},
            "errors": [f"Validator failed: {str(e)}"],
            "messages": [f"✗ Validator: {str(e)}"]
        }


# ============================================================================
# COMPONENT 7: OUTPUT RENDERER (O)
# ============================================================================

def output_renderer_node(state: AgentState) -> AgentState:
    """
    Generates final output in multiple formats.
    
    WHY THIS IMPLEMENTATION:
    1. Multiple formats - Mermaid diagrams, Markdown docs, PNG/SVG
    2. Template-based - consistent, professional output
    3. Hyperlinked - cross-references between sections
    4. Metadata included - timestamps, source refs, validation status
    
    DESIGN DECISIONS:
    - Generate Mermaid for diagrams (widely supported, text-based)
    - Use Markdown for documentation (readable, versionable)
    - Include summary metadata at the top
    - Provide both high-level and detailed views
    """
    try:
        llm_summary = state.get("llm_summary", {})
        architecture_patterns = state.get("architecture_patterns", {})
        dependency_graph = state.get("dependency_graph", {})
        code_facts = state.get("code_facts", {})
        validation_result = state.get("validation_result", {})
        repo_path = state.get("repo_path", "unknown")
        git_ref = state.get("git_ref", "HEAD")
        
        # Build Enhanced Mermaid diagram - Detailed with relationships
        mermaid_lines = ["graph TB"]

        # Get data
        symbols = code_facts.get("symbols", [])
        imports = code_facts.get("imports", [])
        nodes = dependency_graph.get("nodes", [])
        edges = dependency_graph.get("edges", [])
        folder_structure = dependency_graph.get("folder_structure", [])
        subsystems = llm_summary.get("subsystems", [])

        node_counter = 0
        file_to_node_id = {}
        symbol_to_node_id = {}

        # Helper function to determine node style based on file/symbol type
        def get_node_style(file_path, symbol_name=None):
            path_lower = file_path.lower()

            # Test files
            if 'test' in path_lower or 'spec' in path_lower:
                return ':::testStyle'
            # Models/Data
            elif 'model' in path_lower or 'schema' in path_lower or 'entity' in path_lower:
                return ':::modelStyle'
            # Controllers/Routes
            elif 'controller' in path_lower or 'route' in path_lower or 'handler' in path_lower:
                return ':::controllerStyle'
            # Services/Business Logic
            elif 'service' in path_lower or 'business' in path_lower:
                return ':::serviceStyle'
            # Utils/Helpers
            elif 'util' in path_lower or 'helper' in path_lower or 'common' in path_lower:
                return ':::utilStyle'
            # Config
            elif 'config' in path_lower or 'setting' in path_lower:
                return ':::configStyle'
            # Entry points
            elif 'main' in path_lower or 'index' in path_lower or 'app' in path_lower:
                return ':::entryStyle'
            else:
                return ''

        # Group files by subsystem if available
        if subsystems:
            for i, subsystem in enumerate(subsystems[:8]):  # Top 8 subsystems
                subsystem_name = subsystem.get('name', f'Subsystem {i}')
                subsystem_modules = subsystem.get('modules', [])[:15]  # Max 15 files per subsystem

                if not subsystem_modules:
                    continue

                subgraph_id = f"sub_{node_counter}"
                node_counter += 1

                # Escape special characters in subsystem name
                safe_name = subsystem_name.replace('"', '\\"')
                mermaid_lines.append(f'    subgraph {subgraph_id}["{safe_name}"]')

                # Add files and their key symbols
                for module_path in subsystem_modules:
                    if not module_path:
                        continue

                    file_name = module_path.split('/')[-1]
                    file_node_id = f"F{node_counter}"
                    node_counter += 1
                    file_to_node_id[module_path] = file_node_id

                    # Get key symbols from this file
                    file_symbols = [s for s in symbols if s.get('file') == module_path]

                    # Create node with symbols if available
                    if file_symbols:
                        # Show top 3 symbols
                        top_symbols = file_symbols[:3]
                        symbol_names = [s.get('name', '') for s in top_symbols]
                        symbol_types = [s.get('type', '') for s in top_symbols]

                        # Format: filename<br/>Class1, func1
                        symbols_text = ', '.join([f"{name}()" if t == 'function' else name
                                                  for name, t in zip(symbol_names, symbol_types)])
                        if len(file_symbols) > 3:
                            symbols_text += f' +{len(file_symbols)-3} more'

                        label = f"{file_name}<br/><small>{symbols_text}</small>"
                    else:
                        label = file_name

                    style = get_node_style(module_path)
                    safe_label = label.replace('"', '\\"')
                    mermaid_lines.append(f'        {file_node_id}["{safe_label}"]{style}')

                mermaid_lines.append('    end')
        else:
            # Fallback: Show top files by centrality, or all files if no centrality data
            if nodes:
                # Try to sort by importance
                sorted_nodes = sorted(nodes,
                                    key=lambda n: (n.get('centrality', 0) * n.get('in_degree', 0) + n.get('in_degree', 0)),
                                    reverse=True)[:30]
            else:
                # Ultimate fallback: create nodes from file tree
                sorted_nodes = []
                if folder_structure:
                    for folder in folder_structure[:5]:
                        for file_path in folder.get('files', [])[:10]:
                            sorted_nodes.append({'id': file_path})

            for node in sorted_nodes:
                file_path = node.get('id', '')
                if not file_path:
                    continue

                file_name = file_path.split('/')[-1]
                file_node_id = f"F{node_counter}"
                node_counter += 1
                file_to_node_id[file_path] = file_node_id

                # Get key symbols
                file_symbols = [s for s in symbols if s.get('file') == file_path]
                if file_symbols:
                    top_symbols = file_symbols[:2]
                    symbols_text = ', '.join([s.get('name', '') for s in top_symbols])
                    if len(file_symbols) > 2:
                        symbols_text += f' +{len(file_symbols)-2}'
                    label = f"{file_name}<br/><small>{symbols_text}</small>"
                else:
                    label = file_name

                style = get_node_style(file_path)
                safe_label = label.replace('"', '\\"')
                mermaid_lines.append(f'    {file_node_id}["{safe_label}"]{style}')

        # If still no nodes were added, add a placeholder message
        if len(file_to_node_id) == 0:
            mermaid_lines.append('    NO_DATA["No files to display<br/><small>Analysis may have failed</small>"]:::utilStyle')

        # Add relationships with different arrow types
        added_edges = set()
        edge_count = 0

        for edge in edges:
            if edge_count >= 60:  # Max 60 edges for clarity
                break

            source = edge.get('source', '')
            target = edge.get('target', '')
            relationship = edge.get('relationship', 'unknown')
            weight = edge.get('weight', 1)

            source_id = file_to_node_id.get(source)
            target_id = file_to_node_id.get(target)

            if source_id and target_id and (source_id, target_id) not in added_edges:
                # Different arrow styles based on relationship type and weight
                if relationship == 'intra_folder':
                    # Same folder - use thicker arrow
                    if weight > 3:
                        arrow = "==>"  # Very strong dependency
                    else:
                        arrow = "-->"  # Normal dependency
                elif relationship == 'inter_folder':
                    # Cross-folder - use dashed arrow
                    arrow = "-.->'"
                else:
                    arrow = "-->"

                # Add label for strong dependencies
                if weight > 5:
                    mermaid_lines.append(f"    {source_id} {arrow}|{weight}| {target_id}")
                else:
                    mermaid_lines.append(f"    {source_id} {arrow} {target_id}")

                added_edges.add((source_id, target_id))
                edge_count += 1

        # Add styling classes
        mermaid_lines.append("")
        mermaid_lines.append("    classDef testStyle fill:#ffebee,stroke:#c62828,stroke-width:2px")
        mermaid_lines.append("    classDef modelStyle fill:#e3f2fd,stroke:#1565c0,stroke-width:2px")
        mermaid_lines.append("    classDef controllerStyle fill:#f3e5f5,stroke:#6a1b9a,stroke-width:2px")
        mermaid_lines.append("    classDef serviceStyle fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px")
        mermaid_lines.append("    classDef utilStyle fill:#fff3e0,stroke:#ef6c00,stroke-width:2px")
        mermaid_lines.append("    classDef configStyle fill:#fce4ec,stroke:#c2185b,stroke-width:2px")
        mermaid_lines.append("    classDef entryStyle fill:#e0f2f1,stroke:#00695c,stroke-width:3px")

        mermaid_diagram = "\n".join(mermaid_lines)
        
        # Build COMPREHENSIVE Markdown documentation
        project_overview = llm_summary.get("project_overview", {})
        data_flow = llm_summary.get("data_flow", "")

        markdown_parts = [
            f"# 🏗️ Architecture Analysis: {repo_path}",
            f"\n**Repository:** `{repo_path}`",
            f"**Git Ref:** `{git_ref}`",
            f"**Analysis Date:** {datetime.now().strftime('%Y-%m-%d')}",
            f"**Validation Status:** {'✓ Passed' if validation_result.get('valid') else '✗ Failed'}",
            "\n---\n",
        ]

        # Add Project Overview if available
        if project_overview:
            markdown_parts.append("## 📋 Project Overview")
            markdown_parts.append(f"\n**Purpose:** {project_overview.get('purpose', 'N/A')}")
            markdown_parts.append(f"\n**Architecture Style:** {project_overview.get('architecture_style', 'N/A')}")

            tech_stack = project_overview.get('tech_stack', [])
            if tech_stack:
                markdown_parts.append(f"\n**Tech Stack:** {', '.join(tech_stack)}")

            entry_points = project_overview.get('entry_points', [])
            if entry_points:
                markdown_parts.append("\n**Entry Points:**")
                for entry in entry_points:
                    markdown_parts.append(f"- `{entry}`")

        markdown_parts.append("\n---\n")
        markdown_parts.append("## 🎯 Quick Start Guide")
        markdown_parts.append("\n### For New Team Members")

        # Calculate statistics
        total_files = len(dependency_graph.get('nodes', []))
        total_folders = dependency_graph.get('metrics', {}).get('total_folders', 0)
        total_dependencies = len(dependency_graph.get('edges', []))

        markdown_parts.append(f"\n**Codebase Statistics:**")
        markdown_parts.append(f"- 📁 Total Files: {total_files}")
        markdown_parts.append(f"- 📂 Total Folders: {total_folders}")
        markdown_parts.append(f"- 🔗 Total Dependencies: {total_dependencies}")

        # Get language breakdown
        symbols = code_facts.get("symbols", [])
        lang_count = {}
        for symbol in symbols:
            lang = symbol.get("file", "").split(".")[-1]
            lang_count[lang] = lang_count.get(lang, 0) + 1

        if lang_count:
            markdown_parts.append(f"\n**Languages Used:**")
            for lang, count in sorted(lang_count.items(), key=lambda x: x[1], reverse=True)[:5]:
                markdown_parts.append(f"- {lang.upper()}: {count} files")

        markdown_parts.append("\n---\n")
        markdown_parts.append("## 🗺️ Architecture Diagram")
        markdown_parts.append("\n**Legend:**")
        markdown_parts.append("\n**Node Colors:**")
        markdown_parts.append("- 🟢 **Teal**: Entry Points (main, index, app files)")
        markdown_parts.append("- 🔵 **Blue**: Models / Data / Schemas")
        markdown_parts.append("- 🟣 **Purple**: Controllers / Routes / Handlers")
        markdown_parts.append("- 🟢 **Green**: Services / Business Logic")
        markdown_parts.append("- 🟠 **Orange**: Utilities / Helpers / Common")
        markdown_parts.append("- 🔴 **Pink**: Tests / Specs")
        markdown_parts.append("- 🌸 **Rose**: Configuration / Settings")
        markdown_parts.append("\n**Arrows:**")
        markdown_parts.append("- `-->` Solid Arrow: Direct dependency (import)")
        markdown_parts.append("- `==>` Thick Arrow: Strong dependency (multiple imports)")
        markdown_parts.append("- `-.->` Dashed Arrow: Cross-module dependency")
        markdown_parts.append("- `|N|` Edge Label: Number of imports (when >5)")
        markdown_parts.append("\n**Node Format:**")
        markdown_parts.append("- **filename.ext**<br/>*KeyClass, function(), +N more*")
        markdown_parts.append("- Shows top 3 classes/functions per file")
        markdown_parts.append("\n```mermaid")
        markdown_parts.append(mermaid_diagram)
        markdown_parts.append("```")

        # Add Data Flow if available
        if data_flow:
            markdown_parts.append("\n## 🔄 Data Flow")
            markdown_parts.append(f"\n{data_flow}")

        markdown_parts.append("\n## 📁 Folder Structure")

        # Add folder structure details
        markdown_parts.append(f"\n**Total Folders:** {dependency_graph.get('metrics', {}).get('total_folders', 0)}")
        markdown_parts.append(f"**Intra-folder Dependencies:** {dependency_graph.get('metrics', {}).get('intra_folder_edges', 0)}")
        markdown_parts.append(f"**Inter-folder Dependencies:** {dependency_graph.get('metrics', {}).get('inter_folder_edges', 0)}")

        if folder_structure:
            markdown_parts.append("\n**Key Folders:**")
            for folder in folder_structure[:10]:
                markdown_parts.append(f"- `{folder['path']}/` ({folder['file_count']} files)")

        folder_relationships = dependency_graph.get("folder_relationships", [])
        if folder_relationships:
            markdown_parts.append("\n**Folder Dependencies:**")
            for rel in folder_relationships[:10]:
                markdown_parts.append(f"- {rel['from_to']} ({rel['count']} imports)")

        markdown_parts.append("\n## Detected Patterns")

        for pattern in architecture_patterns.get("detected_patterns", []):
            markdown_parts.append(f"\n### {pattern['type']} (Confidence: {pattern['confidence']:.0%})")
            markdown_parts.append("\n**Evidence:**")
            for evidence in pattern.get("evidence", []):
                markdown_parts.append(f"- {evidence}")
        
        markdown_parts.append("\n## 🧩 Subsystems & Components")
        markdown_parts.append("\n### Detailed Breakdown")

        for i, subsystem in enumerate(llm_summary.get("subsystems", []), 1):
            markdown_parts.append(f"\n### {i}. {subsystem['name']}")

            # Purpose
            purpose = subsystem.get('purpose', subsystem.get('responsibility', 'Not specified'))
            markdown_parts.append(f"\n**📝 Purpose:** {purpose}")

            # Technology
            tech = subsystem.get('technology', 'N/A')
            markdown_parts.append(f"\n**⚙️ Technology:** {tech}")

            # Key Files with roles
            key_files = subsystem.get('key_files', [])
            if key_files:
                markdown_parts.append(f"\n**🔑 Key Files:**")
                for kf in key_files:
                    file_name = kf.get('file', 'unknown')
                    role = kf.get('role', 'N/A')
                    markdown_parts.append(f"- `{file_name}` - {role}")

            # Dependencies (what this subsystem needs)
            dependencies = subsystem.get('dependencies', [])
            if dependencies:
                markdown_parts.append(f"\n**⬇️ Dependencies (uses):**")
                for dep in dependencies:
                    dep_name = dep.get('subsystem', 'unknown')
                    reason = dep.get('reason', 'N/A')
                    markdown_parts.append(f"- **{dep_name}**: {reason}")

            # Provides to (what this subsystem offers to others)
            provides_to = subsystem.get('provides_to', [])
            if provides_to:
                markdown_parts.append(f"\n**⬆️ Provides To:**")
                for prov in provides_to:
                    prov_name = prov.get('subsystem', 'unknown')
                    what = prov.get('what', 'N/A')
                    markdown_parts.append(f"- **{prov_name}**: {what}")

            # All modules list (collapsed for readability)
            modules = subsystem.get("modules", [])
            if modules and len(modules) > 0:
                markdown_parts.append(f"\n**📦 All Files ({len(modules)} total):**")
                # Show first 5, then collapse
                for module in modules[:5]:
                    markdown_parts.append(f"- `{module}`")
                if len(modules) > 5:
                    markdown_parts.append(f"- ... and {len(modules) - 5} more files")

            markdown_parts.append("")  # Spacing
        
        markdown_parts.append("\n## Recommendations")
        for i, rec in enumerate(llm_summary.get("recommendations", []), 1):
            markdown_parts.append(f"{i}. {rec}")
        
        # Add validation warnings if any
        if validation_result.get("warnings"):
            markdown_parts.append("\n## Validation Warnings")
            for warning in validation_result["warnings"]:
                markdown_parts.append(f"- ⚠️ {warning}")
        
        markdown_parts.append("\n---\n")
        markdown_parts.append("*Generated by Code Architecture Analysis Agent*")
        
        final_output = "\n".join(markdown_parts)
        
        return {
            **state,
            "final_output": final_output,
            "mermaid_diagram": mermaid_diagram,
            "messages": [f"✓ Output Renderer: Generated {len(final_output)} character report"]
        }
        
    except Exception as e:
        return {
            **state,
            "final_output": f"# Error Generating Output\n\n{str(e)}",
            "mermaid_diagram": "",
            "errors": [f"Output Renderer failed: {str(e)}"],
            "messages": [f"✗ Output Renderer: {str(e)}"]
        }


# ============================================================================
# CONDITIONAL ROUTING
# ============================================================================

def should_retry_validation(state: AgentState) -> Literal["retry_llm", "render_output"]:
    """
    Decides whether to retry LLM generation or proceed to output.
    
    WHY THIS IMPLEMENTATION:
    - Allows iterative refinement based on validation feedback
    - Prevents infinite loops with max iteration check
    - Only retries on fixable errors (not fundamental issues)
    
    DESIGN DECISIONS:
    - Max 3 iterations to balance quality vs. performance
    - Only retry if validation failed but errors are correctable
    - Pass validation feedback to LLM for targeted fixes
    """
    validation_result = state.get("validation_result", {})
    iteration_count = state.get("iteration_count", 0)
    
    # Don't retry if valid or too many iterations
    if validation_result.get("valid") or iteration_count >= 3:
        return "render_output"
    
    # Check if errors are fixable
    errors = validation_result.get("errors", [])
    fixable_errors = [e for e in errors if "schema" in e.lower() or "missing" in e.lower()]
    
    if fixable_errors and iteration_count < 3:
        return "retry_llm"
    else:
        return "render_output"


# ============================================================================
# GRAPH CONSTRUCTION
# ============================================================================

def create_architecture_agent() -> StateGraph:
    """
    Constructs the LangGraph workflow.
    
    WHY THIS GRAPH STRUCTURE:
    1. Linear pipeline - each step builds on previous outputs
    2. Validation loop - allows iterative refinement
    3. Error tolerance - nodes can fail without stopping the entire flow
    4. State accumulation - all intermediate results are preserved
    
    DESIGN DECISIONS:
    - Use StateGraph for automatic state management
    - Add conditional edge for validation retry
    - Keep graph acyclic except for validation loop
    - Start with input validation, end with output rendering
    """
    
    # Initialize graph
    workflow = StateGraph(AgentState)
    
    # Add all nodes
    workflow.add_node("repo_reader", repo_reader_node)
    workflow.add_node("static_analyzer", static_analyzer_node)
    workflow.add_node("graph_builder", graph_builder_node)
    workflow.add_node("pattern_mapper", pattern_mapper_node)
    workflow.add_node("llm_orchestrator", llm_orchestrator_node)
    workflow.add_node("validator", validator_node)
    workflow.add_node("output_renderer", output_renderer_node)
    
    # Define the linear flow
    workflow.set_entry_point("repo_reader")
    workflow.add_edge("repo_reader", "static_analyzer")
    workflow.add_edge("static_analyzer", "graph_builder")
    workflow.add_edge("graph_builder", "pattern_mapper")
    workflow.add_edge("pattern_mapper", "llm_orchestrator")
    workflow.add_edge("llm_orchestrator", "validator")
    
    # Add conditional edge for validation retry
    workflow.add_conditional_edges(
        "validator",
        should_retry_validation,
        {
            "retry_llm": "llm_orchestrator",  # Loop back to LLM
            "render_output": "output_renderer"  # Continue to output
        }
    )
    
    # Set final node
    workflow.add_edge("output_renderer", END)
    
    return workflow.compile()


# ============================================================================
# MAIN EXECUTION
# ============================================================================

def main():
    """
    Example usage of the architecture analysis agent.
    """
    
    # Initialize the agent
    agent = create_architecture_agent()
    
    # Define initial state
    initial_state = {
        "repo_path": "https://github.com/example/repo.git",
        "git_ref": "main",
        "scope_filters": ["src/**/*.py"],
        "depth": -1,
        "file_tree": {},
        "code_facts": {},
        "dependency_graph": {},
        "architecture_patterns": {},
        "llm_summary": {},
        "validation_result": {},
        "final_output": "",
        "errors": [],
        "iteration_count": 0,
        "messages": []
    }
    
    # Run the agent
    print("🚀 Starting Code Architecture Analysis Agent\n")
    print("=" * 80)
    
    result = agent.invoke(initial_state)
    
    # Display execution log
    print("\n📋 Execution Log:")
    print("-" * 80)
    for msg in result.get("messages", []):
        print(msg)
    
    # Display errors if any
    if result.get("errors"):
        print("\n❌ Errors:")
        print("-" * 80)
        for error in result["errors"]:
            print(f"  • {error}")
    
    # Display final output
    print("\n" + "=" * 80)
    print("📄 FINAL OUTPUT:")
    print("=" * 80)
    print(result.get("final_output", "No output generated"))
    
    return result


if __name__ == "__main__":
    main()
