import mongoose, { Document, Schema, Model, model } from "mongoose";


  type MaybeString = string | null | undefined;

  interface User extends Document {
      uid: string;
      fullName: MaybeString;
      firstName: MaybeString;
      email: MaybeString;
      projects?: Project[];
  }

// Main User Schema
const UserSchema = new Schema<User>({
  uid: {
    type: String,
    required: true,
    unique: true,
  },
  fullName: {
    type: String,
    required: true,
  },
  firstName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
});

// Create and export User model
const User: Model<User> = mongoose.models.User || model<User>("User", UserSchema);
export default User;
