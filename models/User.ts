import mongoose, { Document, Schema, Model, model } from "mongoose";



export interface IUser extends Document {
  uid: string;
  fullName: string;
  firstName: string;
  email: string;
  projects?: Project[];
}

// Sub-schemas
const DocItemSchema = new Schema<DocItem>({
  style: { type: String, required: true },
  text: { type: String, required: true },
});

const DocSchema = new Schema<Doc>({
  docTitle: { type: String, required: true },
  docTagline: { type: String, required: false },
  docDesc: { type: String, required: false },
  docItems: { type: [DocItemSchema], required: true },
});

const ProjectSchema = new Schema<Project>({
  projectBirth: { type: Date, required: true },
  projectCreator: { type: String, required: false },
  projectName: { type: String, required: true },
  projectDesc: { type: String, required: false },
  projectLogo: { type: String, required: false },
  docs: { type: [DocSchema], required: true },
});

// Main User Schema
const UserSchema = new Schema<IUser>({
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
  projects: {
    type: [ProjectSchema],
    default: [],
    required: false,
  },
});

// Create and export User model
const User: Model<IUser> = mongoose.models.User || model<IUser>("User", UserSchema);
export default User;
