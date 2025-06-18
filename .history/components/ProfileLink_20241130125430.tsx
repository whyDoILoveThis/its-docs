"use client";
import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useState, useEffect } from "react";
import axios from "axios";
import { useUserStore } from "@/hooks/useUserStore";
import LoaderSpinSmall from "./LoaderSpinSmall";

export default function Home() {
  const { dbUser, setDbUser } = useUserStore();
  const { user } = useUser();
  const { userId } = useAuth();
  const [userExists, setUserExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const checkUser = async (uid: string) => {
    try {
      setLoading(true);
      const response = await axios.post("/api/checkUserExists", { uid });
      const data = response.data;

      if (data.user) {
        setDbUser(data.user);
        setUserExists(true);
      } else {
        setUserExists(false);
      }
      setLoading(false);
    } catch (error) {
      console.error("❌ An error occurred:", error);
      setLoading(false);
    }
  };

  const saveUserToDb = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const response = await axios.post("/api/saveUser", {
        uid: userId,
        fullName: user.fullName,
        firstName: user.firstName,
        email: user.emailAddresses[0].emailAddress,
      });

      const savedUser = response.data;
      console.log("✅ User saved:", savedUser);
      setDbUser(savedUser);
      setLoading(false);
    } catch (error) {
      console.error("❌ Failed to save user:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      if (userId && userId !== undefined) {
        await checkUser(userId);

        // If the user doesn't exist in the DB, save them
        if (userExists === false && user) {
          await saveUserToDb();
        }
      }
    };

    fetchUser();
  }, [userId, user, userExists]); // Run when userId or userExists changes

  if (!dbUser) {
    console.log(userId);
  }

  console.log(user);

  if (loading) return <LoaderSpinSmall />;

  return (
    <div>
      {userExists === null && user ? (
        "Loading..."
      ) : userExists === false ? (
        ""
      ) : !user ? (
        ""
      ) : (
        <Link className="hover:underline" href={`/profile/${dbUser?.uid}`}>
          Profile
        </Link>
      )}
    </div>
  );
}
