"use client";

import { useState } from "react";
import { Service } from "@/types";
import { Play, Plus, Trash2, Code } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceTesterProps {
  service: Service;
  onExecute: (method: string, headers: Record<string, string>, body?: string) => Promise<void>;
  isLoading?: boolean;
  response?: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  } | null;
  error?: string | null;
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface Header {
  id: string;
  key: string;
  value: string;
}

export function ServiceTester({
  service,
  onExecute,
  isLoading = false,
  response = null,
  error = null,
}: ServiceTesterProps) {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [headers, setHeaders] = useState<Header[]>([
    { id: "1", key: "Content-Type", value: "application/json" },
  ]);
  const [body, setBody] = useState("{\n  \n}");

  const handleAddHeader = () => {
    setHeaders([
      ...headers,
      { id: Date.now().toString(), key: "", value: "" },
    ]);
  };

  const handleRemoveHeader = (id: string) => {
    setHeaders(headers.filter((h) => h.id !== id));
  };

  const handleHeaderChange = (id: string, field: "key" | "value", value: string) => {
    setHeaders(
      headers.map((h) => (h.id === id ? { ...h, [field]: value } : h))
    );
  };

  const handleExecute = async () => {
    const headersObj = headers.reduce((acc, h) => {
      if (h.key.trim()) {
        acc[h.key] = h.value;
      }
      return acc;
    }, {} as Record<string, string>);

    await onExecute(method, headersObj, method !== "GET" ? body : undefined);
  };

  return (
    <div className="space-y-6">
      {/* Request Configuration */}
      <div className="card">
        <h3 className="font-display text-xl font-semibold text-lobster-dark mb-4">
          Request Configuration
        </h3>

        {/* HTTP Method Selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-lobster-text mb-2">
            HTTP Method
          </label>
          <div className="flex space-x-2">
            {(["GET", "POST", "PUT", "DELETE"] as HttpMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={cn(
                  "px-4 py-2 rounded-lg font-medium transition-all duration-200",
                  method === m
                    ? "bg-lobster-primary text-white shadow-md"
                    : "bg-lobster-surface text-lobster-dark hover:bg-lobster-border"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Endpoint Display */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-lobster-text mb-2">
            Endpoint
          </label>
          <div className="bg-lobster-surface px-4 py-3 rounded-xl font-mono text-sm text-lobster-dark">
            {service.endpoint}
          </div>
        </div>

        {/* Headers */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-lobster-text">
              Headers
            </label>
            <button
              onClick={handleAddHeader}
              className="flex items-center space-x-1 text-sm text-lobster-primary hover:text-lobster-hover transition-colors duration-200"
            >
              <Plus className="w-4 h-4" />
              <span>Add Header</span>
            </button>
          </div>

          <div className="space-y-2">
            {headers.map((header) => (
              <div key={header.id} className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Header Key"
                  value={header.key}
                  onChange={(e) =>
                    handleHeaderChange(header.id, "key", e.target.value)
                  }
                  className="flex-1 input-field text-sm"
                />
                <input
                  type="text"
                  placeholder="Header Value"
                  value={header.value}
                  onChange={(e) =>
                    handleHeaderChange(header.id, "value", e.target.value)
                  }
                  className="flex-1 input-field text-sm"
                />
                <button
                  onClick={() => handleRemoveHeader(header.id)}
                  className="p-3 rounded-xl hover:bg-red-50 text-red-600 transition-colors duration-200"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Request Body (for POST/PUT/DELETE) */}
        {method !== "GET" && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-lobster-text mb-2">
              Request Body (JSON)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full h-40 input-field font-mono text-sm resize-none"
              placeholder='{\n  "key": "value"\n}'
            />
          </div>
        )}

        {/* Execute Button */}
        <button
          onClick={handleExecute}
          disabled={isLoading}
          className="w-full btn-primary flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Executing...</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              <span>Execute Request</span>
            </>
          )}
        </button>
      </div>

      {/* Response */}
      {(response || error) && (
        <div className="card">
          <div className="flex items-center space-x-2 mb-4">
            <Code className="w-5 h-5 text-lobster-primary" />
            <h3 className="font-display text-xl font-semibold text-lobster-dark">
              Response
            </h3>
          </div>

          {error ? (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 text-red-700">
              <p className="font-semibold mb-1">Error</p>
              <p className="text-sm font-mono">{error}</p>
            </div>
          ) : response ? (
            <div className="space-y-4">
              {/* Status Code */}
              <div>
                <p className="text-sm text-lobster-text mb-2">Status Code</p>
                <div
                  className={cn(
                    "inline-flex px-4 py-2 rounded-lg font-semibold",
                    response.status >= 200 && response.status < 300
                      ? "bg-green-100 text-green-800"
                      : response.status >= 400
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                  )}
                >
                  {response.status}
                </div>
              </div>

              {/* Response Headers */}
              {Object.keys(response.headers).length > 0 && (
                <div>
                  <p className="text-sm text-lobster-text mb-2">Response Headers</p>
                  <div className="bg-lobster-surface rounded-xl p-4 font-mono text-xs space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                    {Object.entries(response.headers).map(([key, value]) => (
                      <div key={key} className="text-lobster-dark">
                        <span className="text-lobster-primary">{key}:</span> {value}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Response Body */}
              <div>
                <p className="text-sm text-lobster-text mb-2">Response Body</p>
                <pre className="bg-lobster-surface rounded-xl p-4 font-mono text-xs text-lobster-dark overflow-x-auto custom-scrollbar max-h-96">
                  {JSON.stringify(response.body, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
