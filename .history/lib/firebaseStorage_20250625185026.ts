// firebaseStorage.ts
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
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


export const fbDeleteImage = async (imageUrl: string): Promise<void> => {
  try {
    // Extract the path from the full download URL
    const baseUrl = "https://firebasestorage.googleapis.com/v0/b/";
    const storageBucket = storage.app.options.storageBucket;

    if (!storageBucket || !imageUrl.startsWith(baseUrl)) {
      throw new Error("Invalid image URL or missing storage bucket.");
    }

    // This regex extracts the path after `/o/` and before `?`
    const encodedPath = imageUrl.split(`/o/`)[1]?.split(`?`)[0];
    if (!encodedPath) throw new Error("Could not extract image path from URL");

    // Decode the %2F encoded slashes (Firebase uses URL-safe encoding)
    const imagePath = decodeURIComponent(encodedPath);

    // Create a reference to the file
    const imageRef = ref(storage, imagePath);

    // Delete the file
    await deleteObject(imageRef);

    console.log("✅ Image deleted successfully from Firebase Storage");
  } catch (error) {
    console.error("❌ Error deleting image from Firebase Storage:", error);
    throw error;
  }
};