import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("print-card rounded-2xl border border-blue-900/70 bg-panel/85 p-5 shadow-glow backdrop-blur", className)}>{children}</div>;
}

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cn("inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2 font-bold text-white transition hover:opacity-90 disabled:opacity-40", props.className)} />;
}

export function GhostButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cn("inline-flex items-center justify-center rounded-xl border border-blue-800/80 px-4 py-2 text-blue-100 transition hover:bg-blue-500/10 disabled:opacity-40", props.className)} />;
}

export function DangerButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cn("inline-flex items-center justify-center rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-red-200 transition hover:bg-red-500/20", props.className)} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("w-full rounded-xl px-3 py-2 outline-none focus:border-cyanx", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("min-h-28 w-full rounded-xl px-3 py-2 outline-none focus:border-cyanx", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("w-full rounded-xl px-3 py-2 outline-none focus:border-cyanx", props.className)} />;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-blue-200/70">{children}</label>;
}

export function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const cls =
    tone === "good" ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-200" :
    tone === "warn" ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200" :
    tone === "bad" ? "border-red-500/40 bg-red-500/10 text-red-200" :
    "border-blue-700 bg-blue-500/10 text-blue-200";
  return <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-bold", cls)}>{children}</span>;
}
