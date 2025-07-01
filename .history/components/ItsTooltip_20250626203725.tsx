import React, { useState } from "react";
import "@/ItsTooltip/ItsTooltip.css";

interface Props {
  tooltipClassName?: string;
  children: React.ReactNode;
  tooltipText?: string;
  tooltipElement?: React.ReactNode;
  delay?: number;
}
const ItsTooltip = ({
  tooltipClassName,
  children,
  tooltipText,
  tooltipElement,
  delay = 0,
}: Props) => {
  const [showReactionTooltip, setShowReactionTooltip] = useState(false);

  return (
    <div
      onMouseEnter={() => {
        setTimeout(() => {
          setShowReactionTooltip(true);
        }, delay);
      }}
      onMouseLeave={() => {
        setShowReactionTooltip(false);
      }}
      onClick={() => {
        setShowReactionTooltip(true);
      }}
      className={`${showReactionTooltip && "tooltip"}`}
    >
      <span
        onMouseEnter={() => {
          setTimeout(() => {
            setShowReactionTooltip(true);
          }, delay);
        }}
        onMouseLeave={() => {
          setShowReactionTooltip(false);
        }}
      >
        <div
          className={`tooltiptext z-50 ${tooltipClassName && tooltipClassName}`}
        >
          {tooltipText ? tooltipText : tooltipElement && tooltipElement}
        </div>
      </span>
      {children}
    </div>
  );
};

export default ItsTooltip;
