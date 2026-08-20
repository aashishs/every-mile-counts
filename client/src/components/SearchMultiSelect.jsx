import { useEffect, useMemo, useRef, useState } from 'react';

export default function SearchMultiSelect({
  options = [],
  value = [],
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search',
  emptyText = 'No matches',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const selected = useMemo(
    () => options.filter((option) => value.includes(option.id)),
    [options, value]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (id) => {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  };

  const remove = (id, event) => {
    event.preventDefault();
    event.stopPropagation();
    onChange(value.filter((item) => item !== id));
  };

  const visibleChips = selected.slice(0, 3);
  const extra = selected.length - visibleChips.length;

  return (
    <div ref={rootRef} className="relative">
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((next) => !next)}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((next) => !next);
          }
        }}
        className={`w-full min-h-[42px] text-left bg-ink border border-line rounded-xl px-3 py-2 flex flex-wrap gap-1.5 items-center ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
      >
        {!selected.length ? (
          <span className="text-muted text-sm">{placeholder}</span>
        ) : (
          <>
            {visibleChips.map((option) => (
              <span key={option.id} className="badge badge-brand max-w-full">
                <span className="truncate">{option.label}</span>
                <button
                  type="button"
                  className="ml-1 text-teal-100"
                  onClick={(event) => remove(option.id, event)}
                  aria-label={`Remove ${option.label}`}
                >
                  ×
                </button>
              </span>
            ))}
            {extra > 0 ? <span className="text-xs text-muted">+{extra} more</span> : null}
          </>
        )}
      </div>
      {open && !disabled ? (
        <div className="absolute z-30 mt-1 w-full bg-[#121a22] border border-line rounded-xl shadow-card overflow-hidden">
          <div className="p-2 border-b border-line">
            <input
              ref={searchRef}
              value={query}
              placeholder={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
            {!filtered.length ? (
              <li className="px-3 py-2 text-sm text-muted">{emptyText}</li>
            ) : (
              filtered.map((option) => {
                const checked = value.includes(option.id);
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-hover ${checked ? 'text-brand' : ''}`}
                      onClick={() => toggle(option.id)}
                    >
                      <span className={`inline-flex w-4 h-4 rounded border items-center justify-center text-[10px] ${checked ? 'bg-brand border-brand text-white' : 'border-line'}`}>
                        {checked ? '✓' : ''}
                      </span>
                      <span className="truncate">{option.label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function SearchSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search',
  emptyText = 'No matches',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const selected = options.find((option) => option.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  const pick = (id) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((next) => !next)}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((next) => !next);
          }
        }}
        className={`w-full min-h-[42px] text-left bg-ink border border-line rounded-xl px-3 py-2 flex items-center ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
      >
        {selected ? (
          <span className="truncate">{selected.label}</span>
        ) : (
          <span className="text-muted text-sm">{placeholder}</span>
        )}
      </div>
      {open && !disabled ? (
        <div className="absolute z-30 mt-1 w-full bg-[#121a22] border border-line rounded-xl shadow-card overflow-hidden">
          <div className="p-2 border-b border-line">
            <input
              ref={searchRef}
              value={query}
              placeholder={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (filtered[0]) pick(filtered[0].id);
                }
              }}
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
            {!filtered.length ? (
              <li className="px-3 py-2 text-sm text-muted">{emptyText}</li>
            ) : (
              filtered.map((option) => {
                const checked = option.id === value;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-hover ${checked ? 'text-brand' : ''}`}
                      onClick={() => pick(option.id)}
                    >
                      <span className="truncate">{option.label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
