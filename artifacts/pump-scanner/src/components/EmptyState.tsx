import React from "react";
import { Radar, Radio, Disc } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: "radar" | "radio" | "disc";
}

export function EmptyState({ title, description, icon = "radar" }: EmptyStateProps) {
  const Icon = icon === "radio" ? Radio : icon === "disc" ? Disc : Radar;
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 bg-green-50 border border-green-200">
        <Icon className="w-7 h-7 text-green-500 animate-pulse" />
      </div>
      <h3 className="text-base font-bold text-gray-800 mb-2 font-mono">{title}</h3>
      <p className="text-gray-500 font-mono text-xs max-w-xs leading-relaxed">{description}</p>
      <div className="mt-6 flex items-center gap-2 text-[10px] font-mono text-gray-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        Scanner active — checking every 15s
      </div>
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 flex gap-3 animate-pulse">
          <div className="w-14 h-14 rounded-xl bg-gray-100 flex-shrink-0" />
          <div className="flex-1 space-y-2.5 py-1">
            <div className="flex justify-between gap-4">
              <div className="w-1/3 h-4 bg-gray-100 rounded-lg" />
              <div className="w-1/5 h-4 bg-gray-100 rounded-lg" />
            </div>
            <div className="w-1/4 h-3 bg-gray-100 rounded-lg" />
            <div className="flex gap-2 pt-1">
              <div className="w-20 h-7 bg-gray-100 rounded-lg" />
              <div className="w-16 h-7 bg-gray-100 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
