import { useConfirm } from "@/components/ItsConfirmProvider";
import { useUserStore } from "@/hooks/useUserStore";
import axios from "axios";
import { useRouter } from "next/navigation";
import React from "react";

interface Props {
  projUid: string;
}
const DeleteProjectBtn = ({ projUid }: Props) => {
  const { dbUser } = useUserStore();
  const { ItsConfirm } = useConfirm();
  const router = useRouter();

  console.log(dbUser?.uid);

  async function deleteProject() {
    const confirmed = await ItsConfirm(
      `Are you sure you want to delete this project? This can NOT be undone.`
    );
    if (confirmed) {
      try {
        const response = await axios.delete("/api/deleteProject", {
          data: { projUid }, // Include the projectUid in the request body
        });

        console.log("✅ Project deleted successfully:", response.data);
        router.push(`/profile/${dbUser?.uid}`);
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error(
            "❌ Axios Error:",
            error.response?.data || error.message
          );
        } else {
          console.error("❌ Unexpected Error:", error);
        }
      }
    }
  }

  return <div onClick={deleteProject}>Delete</div>;
};

export default DeleteProjectBtn;
