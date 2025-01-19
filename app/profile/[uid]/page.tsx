import React from "react";
import ProfilePage from "./ProfilePage";


//???! A project page component is created to accept the projUid because the async nature of this function caused issues with react jsx

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
