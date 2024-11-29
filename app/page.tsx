"use client";
import { useAuth, useUser } from "@clerk/nextjs";
import { useState, useEffect } from "react";

export default function Home() {
  const [dbUser, setDbUser] = useState<User | null>(null);
  const { user } = useUser();
  const { userId } = useAuth(); // `user` provides more details if needed
  const [userExists, setUserExists] = useState<boolean | null>(null);

  const checkUser = async (uid: string) => {
    try {
      const response = await fetch("/api/checkUserExists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uid }),
      });

      if (!response.ok) {
        throw new Error(
          `Network response was not ok, status: ${response.status}`
        );
      }

      const data = await response.json();

      if (data.user) {
        setDbUser(data.user);
        setUserExists(true);
      } else {
        setUserExists(false);
      }
    } catch (error) {
      console.error("❌ An error occurred:", error);
    }
  };

  const saveUserToDb = async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/saveUser", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid: userId,
          fullName: user.fullName,
          firstName: user.firstName,
          email: user.emailAddresses[0].emailAddress,
        }),
      });

      if (!response.ok) {
        throw new Error(`Save user failed, status: ${response.status}`);
      }

      const savedUser = await response.json();
      console.log("✅ User saved:", savedUser);
      setDbUser(savedUser);
    } catch (error) {
      console.error("❌ Failed to save user:", error);
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      if (userId) {
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
    const cheese = 4;
    console.log(cheese);
  }

  return (
    <div>
      {userExists === null ? "Loading..." : <div>{dbUser?.fullName}</div>}
    </div>
  );
}
