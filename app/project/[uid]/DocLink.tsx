import React from "react";

interface Props {
  doc: Doc;
}
const DocLink = ({ doc }: Props) => {
  return <div className="btn !border-none">{doc.title}</div>;
};

export default DocLink;
