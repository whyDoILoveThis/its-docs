import mongoose, { Document, Schema, Model, model } from "mongoose";


  type MaybeString = string | null | undefined;

  interface User extends Document {
      uid: string;
      fullName: MaybeString;
      firstName: MaybeString;
      email: MaybeString;
      bio?: MaybeString;
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
  bio: {
    type: String,
    required: false,
  },
});

// Re-register model in dev so schema changes take effect without restart
if (process.env.NODE_ENV !== "production" && mongoose.models.User) {
  delete mongoose.models.User;
}

const User: Model<User> = mongoose.models.User || model<User>("User", UserSchema);
export default User;
