"""
FastAPI Backend Server for Code Architecture Analysis Agent

This server exposes the LangGraph agent as REST APIs that can be consumed
by the frontend application (cortex-vision-canvas).

Features:
- Async API endpoints for repository analysis
- WebSocket support for real-time progress updates
- CORS enabled for frontend integration
- Job queue for long-running analyses
- Result caching
- Health check endpoints
"""

import os
import asyncio
import json
import uuid
import shutil
import tempfile
from datetime import datetime
from typing import Optional, Dict, List
from enum import Enum
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn
import zipfile
import tarfile

# Import our agent
from code_architecture_agent import create_architecture_agent

# ============================================================================
# CONFIGURATION
# ============================================================================

app = FastAPI(
    title="Code Architecture Analysis API",
    description="AI-powered code architecture analysis using LangGraph",
    version="1.0.0"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for jobs (use Redis in production)
jobs_db: Dict[str, dict] = {}
results_cache: Dict[str, dict] = {}

# WebSocket connections manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, job_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[job_id] = websocket

    def disconnect(self, job_id: str):
        if job_id in self.active_connections:
            del self.active_connections[job_id]

    async def send_update(self, job_id: str, message: dict):
        if job_id in self.active_connections:
            try:
                await self.active_connections[job_id].send_json(message)
            except:
                self.disconnect(job_id)

manager = ConnectionManager()


# ============================================================================
# MODELS
# ============================================================================

class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisRequest(BaseModel):
    """Request model for starting a new analysis"""
    repo_path: str = Field(..., description="Git repository URL or local path")
    git_ref: str = Field(default="main", description="Branch, tag, or commit SHA")
    scope_filters: List[str] = Field(
        default=["**/*.py", "**/*.js", "**/*.ts", "**/*.tsx"],
        description="File patterns to include in analysis"
    )
    depth: int = Field(default=-1, description="Maximum directory depth (-1 = unlimited)")
    
    class Config:
        schema_extra = {
            "example": {
                "repo_path": "https://github.com/example/repo.git",
                "git_ref": "main",
                "scope_filters": ["src/**/*.py"],
                "depth": -1
            }
        }


class JobResponse(BaseModel):
    """Response model for job status"""
    job_id: str
    status: JobStatus
    created_at: str
    updated_at: str
    progress: Optional[int] = None
    message: Optional[str] = None


class AnalysisResult(BaseModel):
    """Response model for completed analysis"""
    job_id: str
    status: JobStatus
    repo_path: str
    git_ref: str
    
    # Analysis results
    file_count: Optional[int] = None
    symbol_count: Optional[int] = None
    node_count: Optional[int] = None
    pattern_count: Optional[int] = None
    
    # Architecture data
    patterns: Optional[List[dict]] = None
    subsystems: Optional[List[dict]] = None
    recommendations: Optional[List[str]] = None
    
    # Outputs
    markdown_output: Optional[str] = None
    mermaid_diagram: Optional[str] = None
    
    # Metadata
    errors: Optional[List[str]] = None
    warnings: Optional[List[str]] = None
    execution_time: Optional[float] = None


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def create_job(request: AnalysisRequest) -> str:
    """Create a new analysis job"""
    job_id = str(uuid.uuid4())
    
    jobs_db[job_id] = {
        "job_id": job_id,
        "status": JobStatus.PENDING,
        "request": request.dict(),
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "progress": 0,
        "message": "Job created"
    }
    
    return job_id


def update_job_status(job_id: str, status: JobStatus, progress: int = None, message: str = None):
    """Update job status"""
    if job_id in jobs_db:
        jobs_db[job_id]["status"] = status
        jobs_db[job_id]["updated_at"] = datetime.utcnow().isoformat()
        
        if progress is not None:
            jobs_db[job_id]["progress"] = progress
        
        if message:
            jobs_db[job_id]["message"] = message


async def send_progress_update(job_id: str, step: str, progress: int, message: str):
    """Send progress update via WebSocket"""
    update = {
        "type": "progress",
        "job_id": job_id,
        "step": step,
        "progress": progress,
        "message": message,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    await manager.send_update(job_id, update)
    update_job_status(job_id, JobStatus.RUNNING, progress, message)


async def run_analysis_async(job_id: str, request: AnalysisRequest):
    """Run the analysis in the background"""
    start_time = datetime.utcnow()
    
    try:
        # Update status
        update_job_status(job_id, JobStatus.RUNNING, 0, "Starting analysis...")
        await send_progress_update(job_id, "initialize", 0, "Initializing agent...")
        
        # Create agent
        agent = create_architecture_agent()
        
        # Prepare initial state
        initial_state = {
            "repo_path": request.repo_path,
            "git_ref": request.git_ref,
            "scope_filters": request.scope_filters,
            "depth": request.depth,
            "file_tree": {},
            "code_facts": {},
            "dependency_graph": {},
            "architecture_patterns": {},
            "llm_summary": {},
            "validation_result": {},
            "final_output": "",
            "mermaid_diagram": "",
            "errors": [],
            "iteration_count": 0,
            "messages": []
        }
        
        # Progress tracking
        steps = [
            ("repo_reader", 15, "Fetching repository files..."),
            ("static_analyzer", 30, "Parsing code structure..."),
            ("graph_builder", 45, "Building dependency graph..."),
            ("pattern_mapper", 60, "Detecting architecture patterns..."),
            ("llm_orchestrator", 75, "Analyzing with AI..."),
            ("validator", 85, "Validating results..."),
            ("output_renderer", 95, "Generating documentation..."),
        ]
        
        # Run agent with progress updates
        await send_progress_update(job_id, "repo_reader", 10, "Starting analysis...")
        
        # Run the agent (blocking call, but in background task)
        result = await asyncio.to_thread(agent.invoke, initial_state)
        
        # Send progress for each completed step
        for i, (step, progress, message) in enumerate(steps):
            await send_progress_update(job_id, step, progress, message)
            await asyncio.sleep(0.1)  # Small delay for UX
        
        # Extract results
        execution_time = (datetime.utcnow() - start_time).total_seconds()

        # Get Mermaid diagram directly from state (now stored separately)
        mermaid_diagram = result.get("mermaid_diagram", "")

        # Fallback: try to extract from markdown if not in state
        if not mermaid_diagram and "```mermaid" in result.get("final_output", ""):
            try:
                start = result["final_output"].find("```mermaid") + len("```mermaid\n")
                end = result["final_output"].find("```", start)
                mermaid_diagram = result["final_output"][start:end].strip()
            except:
                pass
        
        # Build response
        analysis_result = {
            "job_id": job_id,
            "status": JobStatus.COMPLETED,
            "repo_path": request.repo_path,
            "git_ref": request.git_ref,
            
            # Statistics
            "file_count": result.get("file_tree", {}).get("metadata", {}).get("total_files", 0),
            "symbol_count": result.get("code_facts", {}).get("metadata", {}).get("total_symbols", 0),
            "node_count": result.get("dependency_graph", {}).get("metrics", {}).get("total_nodes", 0),
            "pattern_count": len(result.get("architecture_patterns", {}).get("detected_patterns", [])),
            
            # Architecture data
            "patterns": result.get("architecture_patterns", {}).get("detected_patterns", []),
            "subsystems": result.get("llm_summary", {}).get("subsystems", []),
            "recommendations": result.get("llm_summary", {}).get("recommendations", []),
            "overall_architecture": result.get("llm_summary", {}).get("overall_architecture", ""),
            
            # Full outputs
            "markdown_output": result.get("final_output", ""),
            "mermaid_diagram": mermaid_diagram,
            
            # Graph data (for visualization)
            "dependency_graph": {
                "nodes": result.get("dependency_graph", {}).get("nodes", []),
                "edges": result.get("dependency_graph", {}).get("edges", []),
                "clusters": result.get("dependency_graph", {}).get("clusters", []),
            },

            # Code facts (for call flow analysis)
            "code_facts": {
                "symbols": result.get("code_facts", {}).get("symbols", []),
                "function_calls": result.get("code_facts", {}).get("function_calls", []),
                "class_relationships": result.get("code_facts", {}).get("class_relationships", []),
                "imports": result.get("code_facts", {}).get("imports", []),
            },

            # Metadata
            "errors": result.get("errors", []),
            "warnings": result.get("validation_result", {}).get("warnings", []),
            "execution_time": execution_time,
            "messages": result.get("messages", [])
        }
        
        # Cache result
        results_cache[job_id] = analysis_result
        
        # Update job status
        update_job_status(job_id, JobStatus.COMPLETED, 100, "Analysis completed!")
        
        # Send completion via WebSocket
        await manager.send_update(job_id, {
            "type": "complete",
            "job_id": job_id,
            "result": analysis_result
        })
        
    except Exception as e:
        # Handle errors
        error_message = str(e)
        
        update_job_status(job_id, JobStatus.FAILED, message=error_message)
        
        # Send error via WebSocket
        await manager.send_update(job_id, {
            "type": "error",
            "job_id": job_id,
            "error": error_message
        })
        
        # Store partial result
        results_cache[job_id] = {
            "job_id": job_id,
            "status": JobStatus.FAILED,
            "error": error_message
        }


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Code Architecture Analysis API",
        "status": "healthy",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "active_jobs": len([j for j in jobs_db.values() if j["status"] == JobStatus.RUNNING]),
        "total_jobs": len(jobs_db),
        "cached_results": len(results_cache)
    }


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a codebase file (ZIP or TAR) for analysis.

    Returns the temporary path where the file was extracted.
    """
    try:
        # Create temp directory
        temp_dir = tempfile.mkdtemp(prefix="cortex_upload_")

        # Save uploaded file
        file_path = os.path.join(temp_dir, file.filename)
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        # Extract based on file type
        extract_dir = os.path.join(temp_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)

        if file.filename.endswith('.zip'):
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
        elif file.filename.endswith('.tar') or file.filename.endswith('.tar.gz') or file.filename.endswith('.tgz'):
            with tarfile.open(file_path, 'r:*') as tar_ref:
                tar_ref.extractall(extract_dir)
        else:
            shutil.rmtree(temp_dir)
            raise HTTPException(status_code=400, detail="Unsupported file type. Please upload ZIP or TAR files.")

        # Handle nested directories (common with ZIP files)
        # If extract_dir contains only one subdirectory, use that as the root
        contents = os.listdir(extract_dir)
        if len(contents) == 1:
            single_item = os.path.join(extract_dir, contents[0])
            if os.path.isdir(single_item):
                # Use the nested directory as the root
                extract_dir = single_item

        # Count files to verify extraction
        file_count = sum(1 for root, dirs, files in os.walk(extract_dir) for f in files)

        return {
            "success": True,
            "path": extract_dir,
            "filename": file.filename,
            "file_count": file_count,
            "message": f"File uploaded and extracted to {extract_dir} ({file_count} files found)"
        }

    except Exception as e:
        if 'temp_dir' in locals() and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")


@app.post("/api/analyze", response_model=JobResponse)
async def start_analysis(request: AnalysisRequest, background_tasks: BackgroundTasks):
    """
    Start a new code architecture analysis.

    Returns a job_id that can be used to track progress and retrieve results.
    """
    # Create job
    job_id = create_job(request)

    # Start analysis in background
    background_tasks.add_task(run_analysis_async, job_id, request)

    return JobResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        created_at=jobs_db[job_id]["created_at"],
        updated_at=jobs_db[job_id]["updated_at"],
        progress=0,
        message="Analysis queued"
    )


@app.get("/api/jobs/{job_id}", response_model=JobResponse)
async def get_job_status(job_id: str):
    """Get the status of a specific job"""
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs_db[job_id]
    
    return JobResponse(
        job_id=job["job_id"],
        status=job["status"],
        created_at=job["created_at"],
        updated_at=job["updated_at"],
        progress=job.get("progress", 0),
        message=job.get("message", "")
    )


@app.get("/api/results/{job_id}")
async def get_analysis_result(job_id: str):
    """Get the analysis results for a completed job"""
    if job_id not in results_cache:
        # Check if job exists but not completed
        if job_id in jobs_db:
            job = jobs_db[job_id]
            if job["status"] == JobStatus.RUNNING or job["status"] == JobStatus.PENDING:
                raise HTTPException(
                    status_code=202,
                    detail=f"Analysis still in progress. Status: {job['status']}, Progress: {job.get('progress', 0)}%"
                )
            elif job["status"] == JobStatus.FAILED:
                raise HTTPException(
                    status_code=500,
                    detail=f"Analysis failed: {job.get('message', 'Unknown error')}"
                )

        raise HTTPException(status_code=404, detail="Results not found")

    return results_cache[job_id]


@app.get("/api/results/{job_id}/callflow/{method_name}")
async def get_call_flow(job_id: str, method_name: str, max_depth: int = 5):
    """
    Get the control flow starting from a specific method.

    Returns all methods/functions called from the specified starting point,
    up to max_depth levels deep.
    """
    if job_id not in results_cache:
        raise HTTPException(status_code=404, detail="Results not found")

    results = results_cache[job_id]

    # Extract function calls from code_facts (stored in messages during analysis)
    # For now, we'll need to re-analyze or store this data
    # Let's create a simple call flow tracer

    def trace_calls(start_method, function_calls, max_depth, current_depth=0, visited=None):
        """Recursively trace function calls from a starting method"""
        if visited is None:
            visited = set()

        if current_depth >= max_depth or start_method in visited:
            return []

        visited.add(start_method)

        # Find all calls from this method
        direct_calls = [
            {
                "from": call["from_function"],
                "from_class": call.get("from_class"),
                "to": call["to_function"],
                "file": call["file"],
                "line": call["line"],
                "depth": current_depth
            }
            for call in function_calls
            if call.get("from_function") == start_method or
               f"{call.get('from_class', '')}.{call.get('from_function', '')}" == start_method
        ]

        # Recursively trace calls from each called function
        all_calls = direct_calls.copy()
        for call in direct_calls:
            nested_calls = trace_calls(
                call["to"],
                function_calls,
                max_depth,
                current_depth + 1,
                visited
            )
            all_calls.extend(nested_calls)

        return all_calls

    # Get function calls from the cached results
    function_calls = results.get("code_facts", {}).get("function_calls", [])

    if not function_calls:
        return {
            "start_method": method_name,
            "max_depth": max_depth,
            "calls": [],
            "message": "No function call data available. The codebase may not have been analyzed yet, or no function calls were detected.",
            "available_methods": []
        }

    # Get list of all available methods for suggestions
    available_methods = list(set([
        call["from_function"]
        for call in function_calls
        if call.get("from_function")
    ]))

    # Trace the calls
    traced_calls = trace_calls(method_name, function_calls, max_depth)

    call_flow = {
        "start_method": method_name,
        "max_depth": max_depth,
        "calls": traced_calls,
        "total_calls": len(traced_calls),
        "available_methods": sorted(available_methods)[:100],  # Limit to 100 for dropdown
        "message": f"Found {len(traced_calls)} function calls in the call flow" if traced_calls else f"No calls found from '{method_name}'. Method may not exist or doesn't call other functions."
    }

    return call_flow


@app.get("/api/jobs")
async def list_jobs(status: Optional[JobStatus] = None, limit: int = 50):
    """List all jobs, optionally filtered by status"""
    jobs_list = list(jobs_db.values())
    
    if status:
        jobs_list = [j for j in jobs_list if j["status"] == status]
    
    # Sort by created_at descending
    jobs_list = sorted(jobs_list, key=lambda x: x["created_at"], reverse=True)
    
    # Limit results
    jobs_list = jobs_list[:limit]
    
    return {
        "total": len(jobs_list),
        "jobs": jobs_list
    }


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete a job and its results"""
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Can't delete running jobs
    if jobs_db[job_id]["status"] == JobStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Cannot delete running job")
    
    # Delete from both databases
    del jobs_db[job_id]
    if job_id in results_cache:
        del results_cache[job_id]
    
    return {"message": "Job deleted successfully"}


@app.websocket("/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    """
    WebSocket endpoint for real-time progress updates.
    
    Connect to this endpoint with a job_id to receive live updates
    as the analysis progresses.
    """
    await manager.connect(job_id, websocket)
    
    try:
        # Send initial connection message
        await websocket.send_json({
            "type": "connected",
            "job_id": job_id,
            "message": "WebSocket connected"
        })
        
        # Keep connection alive
        while True:
            # Wait for messages (heartbeat)
            data = await websocket.receive_text()
            
            # Echo heartbeat
            if data == "ping":
                await websocket.send_text("pong")
    
    except WebSocketDisconnect:
        manager.disconnect(job_id)


@app.get("/api/git-history")
async def get_git_history(repo: str):
    """
    Get git history for a repository (branches, tags, recent commits).

    Args:
        repo: Repository path or URL

    Returns:
        branches: List of branch names
        tags: List of tag names
        recent_commits: List of recent commits with hash, message, date
    """
    try:
        import subprocess

        # Resolve repo path
        repo_path = repo

        # Get branches
        try:
            branches_output = subprocess.run(
                ["git", "-C", repo_path, "branch", "-r"],
                capture_output=True,
                text=True,
                check=True
            )
            branches = []
            for line in branches_output.stdout.split('\n'):
                line = line.strip()
                if line and not line.startswith('origin/HEAD'):
                    # Remove 'origin/' prefix
                    branch = line.replace('origin/', '')
                    if branch:
                        branches.append(branch)

            # Also get local branches
            local_branches_output = subprocess.run(
                ["git", "-C", repo_path, "branch"],
                capture_output=True,
                text=True,
                check=True
            )
            for line in local_branches_output.stdout.split('\n'):
                line = line.strip().replace('* ', '')
                if line and line not in branches:
                    branches.append(line)

        except subprocess.CalledProcessError:
            branches = ["main", "master", "dev", "develop"]

        # Get tags
        try:
            tags_output = subprocess.run(
                ["git", "-C", repo_path, "tag", "-l"],
                capture_output=True,
                text=True,
                check=True
            )
            tags = [tag.strip() for tag in tags_output.stdout.split('\n') if tag.strip()]
        except subprocess.CalledProcessError:
            tags = []

        # Get recent commits (last 10)
        try:
            commits_output = subprocess.run(
                ["git", "-C", repo_path, "log", "-10", "--pretty=format:%H|%s|%ai"],
                capture_output=True,
                text=True,
                check=True
            )
            recent_commits = []
            for line in commits_output.stdout.split('\n'):
                if line.strip():
                    parts = line.split('|')
                    if len(parts) == 3:
                        recent_commits.append({
                            "hash": parts[0][:8],  # Short hash
                            "message": parts[1],
                            "date": parts[2]
                        })
        except subprocess.CalledProcessError:
            recent_commits = []

        return {
            "branches": branches[:20],  # Limit to 20 branches
            "tags": tags[:20],  # Limit to 20 tags
            "recent_commits": recent_commits
        }

    except Exception as e:
        # Return fallback data
        return {
            "branches": ["main", "master", "dev", "develop"],
            "tags": [],
            "recent_commits": []
        }


@app.get("/api/patterns")
async def get_available_patterns():
    """Get a list of architecture patterns that can be detected"""
    return {
        "patterns": [
            {
                "type": "Layered Architecture",
                "description": "Clear separation into layers (presentation, business, data)",
                "indicators": ["Unidirectional dependencies", "Layer boundaries"]
            },
            {
                "type": "MVC",
                "description": "Model-View-Controller pattern",
                "indicators": ["Separate models, views, controllers", "View depends on model"]
            },
            {
                "type": "Microservices",
                "description": "Independent services with minimal coupling",
                "indicators": ["Service boundaries", "Independent deployment"]
            },
            {
                "type": "Service-Oriented",
                "description": "Services encapsulate business capabilities",
                "indicators": ["Service boundaries", "Business logic encapsulation"]
            },
            {
                "type": "Hexagonal Architecture",
                "description": "Ports and adapters pattern",
                "indicators": ["Core business logic isolated", "External adapters"]
            }
        ]
    }


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    # Check for API key
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("⚠️  Warning: ANTHROPIC_API_KEY not set")
        print("Please set your API key:")
        print("  export ANTHROPIC_API_KEY='your-key-here'")
    
    print("🚀 Starting Code Architecture Analysis API Server")
    print("=" * 80)
    print("\n📋 Available Endpoints:")
    print("  GET    /                          - Health check")
    print("  GET    /health                    - Detailed health check")
    print("  POST   /api/analyze               - Start new analysis")
    print("  GET    /api/jobs/{job_id}         - Get job status")
    print("  GET    /api/results/{job_id}      - Get analysis results")
    print("  GET    /api/jobs                  - List all jobs")
    print("  DELETE /api/jobs/{job_id}         - Delete job")
    print("  WS     /ws/{job_id}               - WebSocket for progress")
    print("  GET    /api/patterns              - List detectable patterns")
    print("\n📚 API Documentation:")
    print("  Swagger UI: http://localhost:8000/docs")
    print("  ReDoc:      http://localhost:8000/redoc")
    print("\n" + "=" * 80)
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
