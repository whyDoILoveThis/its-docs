// firebaseStorage.ts
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebaseConfig"; // Your Firebase configuration
import {v4} from "uuid";

export const fbUploadImage = async (image: File): Promise<string> => {
  try {
    // Generate unique filename for the image
    const imageName = `${v4()}-${image.name}`;

    // Create a reference to the storage path
    const storageRef = ref(storage, `images/${imageName}`);

    // Upload image to Firebase Storage
    await uploadBytes(storageRef, image);

    // Get download URL for the image
    const downloadURL = await getDownloadURL(storageRef);

    // Return the download URL
    return downloadURL;
  } catch (error) {
    console.error("Error uploading image to Firebase Storage:", error);
    throw error; // Throw error for handling in the component
  }
};
