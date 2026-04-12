"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES, type Language } from "@/domain/entities/Language";
import clsx from "clsx";

interface LanguageSelectorProps {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  id?: string;
  excludeCode?: string;
}

export function LanguageSelector({
  value,
  onChange,
  label = "Target Language",
  id = "language-selector",
  excludeCode,
}: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const languages = SUPPORTED_LANGUAGES.filter((l) => l.code !== excludeCode);
  const filtered = query
    ? languages.filter(
        (l) =>
          l.name.toLowerCase().includes(query.toLowerCase()) ||
          l.nativeName.toLowerCase().includes(query.toLowerCase()) ||
          l.code.toLowerCase().includes(query.toLowerCase()),
      )
    : languages;

  const selected: Language | undefined = languages.find((l) => l.code === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="w-full" ref={ref}>
      {label && (
        <label className="mb-2 block text-sm font-medium text-gray-300" htmlFor={id}>
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200",
          open
            ? "border-brand-400 bg-surface-100 shadow-glow-sm"
            : "border-surface-300 bg-surface-50 hover:border-brand-300",
        )}
      >
        {selected ? (
          <>
            <span className="text-2xl leading-none">{selected.flag}</span>
            <span className="flex-1 text-white font-medium">{selected.name}</span>
            <span className="text-xs text-gray-400 font-mono">{selected.code}</span>
          </>
        ) : (
          <>
            <Globe className="h-5 w-5 text-gray-400" />
            <span className="flex-1 text-gray-400">Select target language…</span>
          </>
        )}
        <ChevronDown
          className={clsx("h-4 w-4 text-gray-400 transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-2 w-full max-h-72 overflow-hidden rounded-xl border border-surface-200 bg-surface-100 shadow-2xl"
            style={{ width: ref.current?.offsetWidth }}
          >
            <div className="p-2 border-b border-surface-200">
              <div className="flex items-center gap-2 rounded-lg bg-surface-200 px-3 py-2">
                <Search className="h-4 w-4 text-gray-400 shrink-0" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search languages…"
                  className="w-full bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                  id={`${id}-search`}
                />
              </div>
            </div>
            <ul className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-4 py-3 text-sm text-gray-400 text-center">No languages found</li>
              ) : (
                filtered.map((lang) => (
                  <li key={lang.code}>
                    <button
                      type="button"
                      id={`lang-option-${lang.code}`}
                      onClick={() => { onChange(lang.code); setOpen(false); setQuery(""); }}
                      className={clsx(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                        value === lang.code
                          ? "bg-brand-500/20 text-brand-300"
                          : "text-gray-200 hover:bg-surface-200",
                      )}
                    >
                      <span className="text-xl leading-none">{lang.flag}</span>
                      <span className="flex-1 text-left font-medium">{lang.name}</span>
                      <span className="text-xs text-gray-500">{lang.nativeName}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
