"use client";

import {
  forwardRef,
  KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { EMPLOYEES, EmployeeMeta } from "@/lib/employees";
import Avatar from "./Avatar";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Called when user hits Enter (without Shift) AND the suggestion popup is closed. */
  onSubmit?: () => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
}

/**
 * Textarea ที่ตรวจจับ "@" แล้วเปิด suggestion popup แสดงรายชื่อพนักงาน + ตำแหน่ง
 * - ↑/↓ เลื่อน, Enter/Tab เลือก, Esc ปิด
 * - แทรกเป็น "@FirstName " เพื่อให้ตรงคอนเวนชั่นเดิม (router ใช้ firstName)
 * - ถ้า popup ปิดอยู่ Enter (ไม่กด shift) จะเรียก onSubmit ปกติ
 */
const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function MentionTextarea(
  { value, onChange, onSubmit, placeholder, rows = 2, className, disabled },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  const [open, setOpen] = useState(false);
  /** Index of "@" character that triggered the current popup (in `value`) */
  const [anchorPos, setAnchorPos] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const matches = useMemo<EmployeeMeta[]>(() => {
    if (!open) return [];
    const q = query.toLowerCase();
    if (!q) return EMPLOYEES;
    return EMPLOYEES.filter(
      (e) =>
        e.firstName.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q),
    );
  }, [open, query]);

  // Clamp activeIdx whenever the filtered list shrinks
  useEffect(() => {
    if (activeIdx >= matches.length) setActiveIdx(Math.max(0, matches.length - 1));
  }, [matches.length, activeIdx]);

  /**
   * Re-scan the text up to the cursor:
   *   - find the last "@" that's at start-of-string or after whitespace
   *   - if found, the chars after it (until cursor) become the query
   *   - if those chars contain whitespace, popup closes
   */
  const updatePopupFromCursor = useCallback(
    (text: string, cursor: number) => {
      const before = text.slice(0, cursor);
      // Last @ that's preceded by start-of-string or whitespace
      const m = before.match(/(^|\s)@([^\s@]*)$/);
      if (!m) {
        if (open) setOpen(false);
        setAnchorPos(null);
        return;
      }
      const at = cursor - m[2].length - 1; // index of the "@"
      setAnchorPos(at);
      setQuery(m[2]);
      setActiveIdx(0);
      if (!open) setOpen(true);
    },
    [open],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);
    updatePopupFromCursor(next, e.target.selectionStart ?? next.length);
  };

  const handleSelect = useCallback(
    (emp: EmployeeMeta) => {
      const ta = innerRef.current;
      if (!ta || anchorPos === null) return;
      const cursor = ta.selectionStart ?? value.length;
      const before = value.slice(0, anchorPos);
      const after = value.slice(cursor);
      const token = `@${emp.firstName} `;
      const next = before + token + after;
      onChange(next);
      setOpen(false);
      setAnchorPos(null);
      // Restore cursor right after the inserted token
      const newPos = (before + token).length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      });
    },
    [anchorPos, onChange, value],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSelect(matches[activeIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  // Also reposition popup when caret moves via click/arrow keys
  const handleSelectionChange = () => {
    const ta = innerRef.current;
    if (!ta) return;
    updatePopupFromCursor(value, ta.selectionStart ?? value.length);
  };

  return (
    <div className="relative flex-1">
      <textarea
        ref={innerRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleSelectionChange}
        onClick={handleSelectionChange}
        placeholder={placeholder}
        rows={rows}
        className={className}
        disabled={disabled}
      />
      {open && matches.length > 0 && (
        <div className="absolute bottom-full left-0 z-40 mb-1 max-h-72 w-[320px] overflow-y-auto rounded-xl border border-border bg-bg shadow-2xl">
          <div className="border-b border-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-ink-dim/70">
            เลือกพนักงาน · ↑↓ Enter
          </div>
          {matches.map((emp, i) => (
            <button
              key={emp.slug}
              type="button"
              onMouseDown={(e) => {
                // mousedown (not click) so textarea doesn't blur before we insert
                e.preventDefault();
                handleSelect(emp);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={[
                "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                i === activeIdx ? "bg-surface-2" : "hover:bg-surface-2/60",
              ].join(" ")}
            >
              <Avatar employee={emp} size={28} ring={i === activeIdx} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12.5px] font-medium text-ink">
                    @{emp.firstName}
                  </span>
                  <span className="text-[10.5px] text-ink-dim">· {emp.name}</span>
                </div>
                <p className="truncate text-[10.5px] text-ink-dim/80">
                  {emp.title} · {emp.department}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default MentionTextarea;
