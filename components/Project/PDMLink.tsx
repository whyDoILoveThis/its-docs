import React from "react";

interface Props {
  diagram: PDMDiagram;
}

const PDMLink = ({ diagram }: Props) => {
  return (
    <div className="btn !border-none">
      <span className="text-xs text-slate-400 mr-2">◆</span>
      {diagram.title}
    </div>
  );
};

export default PDMLink;
