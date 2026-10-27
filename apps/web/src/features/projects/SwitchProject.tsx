import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { LogoMark } from "../../shared/ui/Logo";

const DELAY_MS = 300;

// The sidebar logo mark: a link to the Projects page with a tooltip on hover and keyboard focus (short delay, Escape dismisses, the pointer can move onto the tip).
export function SwitchProject() {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), DELAY_MS);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <span
      className="side-switch"
      onMouseEnter={show}
      onMouseLeave={hide}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          hide();
        }
      }}
    >
      <Link
        to="/projects"
        className="side-switch-link"
        aria-label="Switch project"
        aria-describedby={id}
        onFocus={show}
        onBlur={hide}
      >
        <LogoMark className="side-mark" />
      </Link>
      <span id={id} role="tooltip" className="side-tip" hidden={!open}>
        <strong>Switch project</strong>
        <span>Open your projects</span>
      </span>
    </span>
  );
}
