import React from "react";
import ProfilePage from "./ProfilePage";

async function Page({ params }: { params: Promise<{ uid: string }> }) {
  const userUid = (await params).uid;

  console.log(userUid);

  return (
    <div>
      <ProfilePage userUid={userUid} />
    </div>
  );
}

export default Page;
