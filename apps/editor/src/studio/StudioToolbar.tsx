import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {useRemotionEnvironment} from "remotion";

const StudioToolbarContext = createContext<HTMLElement | null>(null);
const StudioHeaderToolbarContext = createContext<HTMLElement | null>(null);

const findPlaybackRateControl = () => {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("button, [role='button'], span, div"),
  );

  const exactMatches = elements.filter((element) => {
    if (element.textContent?.trim() !== "1x") {
      return false;
    }
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  });

  const smallest = exactMatches.sort((a, b) => {
    const aBounds = a.getBoundingClientRect();
    const bBounds = b.getBoundingClientRect();
    return aBounds.width * aBounds.height - bBounds.width * bBounds.height;
  })[0];

  return (
    smallest?.closest<HTMLElement>("button, [role='button']") ?? smallest ?? null
  );
};

const findProjectHeaderGroup = (compositionId: string) => {
  const matches = Array.from(
    document.querySelectorAll<HTMLElement>("div, span, button"),
  ).filter((element) => {
    const bounds = element.getBoundingClientRect();
    return (
      element.textContent?.includes(compositionId) &&
      element.textContent.length < 200 &&
      bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.top < 45 &&
      bounds.height <= 40
    );
  });

  let group = matches.sort((a, b) => {
    const aBounds = a.getBoundingClientRect();
    const bBounds = b.getBoundingClientRect();
    return aBounds.width * aBounds.height - bBounds.width * bBounds.height;
  })[0];

  while (group?.parentElement) {
    const parent = group.parentElement;
    const bounds = parent.getBoundingClientRect();
    if (
      !parent.textContent?.includes(compositionId) ||
      bounds.top >= 45 ||
      bounds.height > 40 ||
      bounds.width > 650
    ) {
      break;
    }
    group = parent;
  }

  return group ?? null;
};

export const studioToolbarButtonStyle: React.CSSProperties = {
  flex: "0 0 auto",
  height: 30,
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 7,
  padding: "0 10px",
  background: "rgba(28,31,34,0.98)",
  color: "white",
  fontSize: 13,
  fontWeight: 750,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const studioHeaderButtonStyle: React.CSSProperties = {
  ...studioToolbarButtonStyle,
  height: 24,
  borderRadius: 6,
  padding: "0 9px",
  fontSize: 12,
};

export const StudioToolbarProvider: React.FC<{
  children: React.ReactNode;
  compositionId: string;
}> = ({children, compositionId}) => {
  const {isStudio, isReadOnlyStudio} = useRemotionEnvironment();
  const [toolbarRoot, setToolbarRoot] = useState<HTMLDivElement | null>(null);
  const [headerToolbarRoot, setHeaderToolbarRoot] =
    useState<HTMLDivElement | null>(null);
  const toolbarRootRef = useRef<HTMLDivElement | null>(null);
  const headerToolbarRootRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStudio || isReadOnlyStudio) {
      return;
    }

    const attachToolbar = () => {
      animationFrameRef.current = null;
      const control = findPlaybackRateControl();
      if (!control) {
        return;
      }

      let host = toolbarRootRef.current;
      if (!host) {
        host = document.createElement("div");
        host.dataset.remotionCustomToolbar = "true";
        host.style.cssText = [
          "display:inline-flex",
          "align-items:center",
          "gap:6px",
          "height:30px",
          "margin-left:8px",
          "margin-right:8px",
          "flex:0 0 auto",
          "vertical-align:middle",
          "pointer-events:auto",
          "font-family:Arial,sans-serif",
        ].join(";");
        toolbarRootRef.current = host;
        setToolbarRoot(host);
      }

      if (control.nextElementSibling !== host) {
        control.insertAdjacentElement("afterend", host);
      }

      let headerHost = headerToolbarRootRef.current;
      if (!headerHost) {
        headerHost = document.createElement("div");
        headerHost.dataset.remotionCustomHeaderToolbar = "true";
        headerHost.style.cssText = [
          "position:fixed",
          "display:inline-flex",
          "align-items:center",
          "gap:6px",
          "height:24px",
          "z-index:2147483002",
          "pointer-events:auto",
          "font-family:Arial,sans-serif",
        ].join(";");
        document.body.appendChild(headerHost);
        headerToolbarRootRef.current = headerHost;
        setHeaderToolbarRoot(headerHost);
      }

      const headerGroup = findProjectHeaderGroup(compositionId);
      const headerBounds = headerGroup?.getBoundingClientRect();
      const left = headerBounds
        ? Math.round(headerBounds.right + 10)
        : Math.max(360, window.innerWidth - 310);
      const top = headerBounds
        ? Math.round(headerBounds.top + (headerBounds.height - 24) / 2)
        : 2;
      headerHost.style.left = `${left}px`;
      headerHost.style.top = `${top}px`;
      headerHost.style.maxWidth = `${Math.max(180, window.innerWidth - left - 10)}px`;
    };

    const schedulePositionUpdate = () => {
      if (animationFrameRef.current !== null) {
        return;
      }
      animationFrameRef.current = window.requestAnimationFrame(attachToolbar);
    };

    schedulePositionUpdate();
    const observer = new MutationObserver(schedulePositionUpdate);
    observer.observe(document.body, {childList: true, subtree: true});
    window.addEventListener("resize", schedulePositionUpdate);
    window.addEventListener("scroll", schedulePositionUpdate, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedulePositionUpdate);
      window.removeEventListener("scroll", schedulePositionUpdate, true);
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      toolbarRootRef.current?.remove();
      toolbarRootRef.current = null;
      headerToolbarRootRef.current?.remove();
      headerToolbarRootRef.current = null;
    };
  }, [compositionId, isReadOnlyStudio, isStudio]);

  if (!isStudio || isReadOnlyStudio) {
    return <>{children}</>;
  }

  return (
    <StudioToolbarContext.Provider value={toolbarRoot}>
      <StudioHeaderToolbarContext.Provider value={headerToolbarRoot}>
        {children}
      </StudioHeaderToolbarContext.Provider>
    </StudioToolbarContext.Provider>
  );
};

export const useStudioToolbar = () => useContext(StudioToolbarContext);
export const useStudioHeaderToolbar = () =>
  useContext(StudioHeaderToolbarContext);
