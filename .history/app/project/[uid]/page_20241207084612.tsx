import React from "react";
import ProjectPage from "./ProjectPage";

//???! A project page component is created to accept the projUid because the async nature of this function caused issues with react jsx

async function Page({ params }: { params: Promise<{ uid: string }> }) {
  const projUid = (await params).uid;
  return <ProjectPage projUid={projUid} />;
}

export default Page;
