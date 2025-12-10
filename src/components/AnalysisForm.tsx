/**
 * Main analysis form component for code analysis input
 */

import { useRef } from "react";
import { Input } from "@/components/UI/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/UI/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/UI/tabs";
import { Info } from "lucide-react";

interface AnalysisFormProps {
  inputType: "url" | "upload";
  setInputType: (type: "url" | "upload") => void;
  url: string;
  setUrl: (url: string) => void;
  file: File | null;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: () => void;
}

export const AnalysisForm = ({
  inputType,
  setInputType,
  url,
  setUrl,
  file,
  handleFileChange,
  handleSubmit,
}: AnalysisFormProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="fixed top-8 left-1/2 -translate-x-1/2 flex items-center gap-4">
        <h1 className="text-3xl font-telegraf font-light tracking-[0.3em] text-foreground">
          CORTEX
        </h1>
        <Dialog>
          <DialogTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <Info className="h-5 w-5" />
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>About Cortex</DialogTitle>
              <DialogDescription className="text-base leading-relaxed pt-4">
                An AI-powered code architecture visualization and analysis tool that accelerates architectural discovery and code onboarding. Cortex generates accurate, high-level architectural diagrams directly from live codebases by analyzing code structure and aligning findings with common architectural patterns. It parses and summarizes code structure (modules, classes, services, dependencies, call graphs), aligns findings with common architectural patterns, and produces both Mermaid source and rendered images.
                <br/><br/>
                <strong className="text-foreground">Features:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>🔄 Navigate between branches, tags, and commits in results view</li>
                  <li>⚡ Smart caching - instant switching between analyzed versions</li>
                  <li>🎯 Three levels of granularity: High Level, Medium Detail, Full Detail</li>
                  <li>🔍 Interactive call flow visualization from any method</li>
                  <li>💾 Export diagrams as PNG or SVG</li>
                </ul>
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </div>

      <div className="container max-w-2xl mx-auto pt-32 pb-24 px-4 flex-1 flex flex-col items-center justify-center">
        <div className="w-full space-y-8">
          <div className="flex items-center justify-end mb-8">
            <p className="text-xs tracking-widest uppercase text-muted-foreground">
              Code Analysis
            </p>
          </div>

          <Tabs value={inputType} onValueChange={(v) => setInputType(v as 'url' | 'upload')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="url">URL</TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="space-y-4 mt-6">
              <Input
                type="url"
                placeholder="Enter repository URL (GitHub, GitLab, Bitbucket)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full"
              />
            </TabsContent>
            <TabsContent value="upload" className="space-y-4 mt-6">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
                accept=".zip,.tar,.tar.gz"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              >
                <p className="text-sm text-muted-foreground">
                  {file ? file.name : "Click to upload or drag and drop"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">ZIP, TAR, or folder</p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end mt-8">
            <button
              onClick={handleSubmit}
              disabled={(inputType === "url" && !url.trim()) || (inputType === "upload" && !file)}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-xs tracking-widest uppercase hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
            >
              Submit →
            </button>
          </div>
        </div>
      </div>

      <footer className="fixed bottom-4 left-1/2 -translate-x-1/2">
        <p className="text-xs text-muted-foreground tracking-wider">
          created by{' '}
          <a
            href="https://www.linkedin.com/in/shriya-challapuram/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors underline decoration-primary/30 hover:decoration-primary"
          >
            Sri Shriya Challapuram
          </a>
          {' '}2025
        </p>
      </footer>
    </div>
  );
};
