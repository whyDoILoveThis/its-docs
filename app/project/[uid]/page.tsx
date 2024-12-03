import React from "react";
import ProjectPage from "./ProjectPage";

async function Page({ params }: { params: Promise<{ uid: string }> }) {
  const projUid = (await params).uid;
  return <ProjectPage projUid={projUid} />;
}

export default Page;
