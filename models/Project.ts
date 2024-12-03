import mongoose, { Document, Schema, Model, model } from "mongoose";

interface Project extends Document {
    uid: string;
    birth: Date;
    creatorUid?: string;
    title: string;
    desc?: string;
    logoUrl?: string;
    docs: Doc[];
}

interface Doc extends Document {
    uid: string;
    title: string;
    tagline?: string;
    desc?: string
    docItems: DocItem[];
}

interface DocItem extends Document {
    uid: string;
    style: string;
    text: string;
}

// Sub-schemas
const DocItemSchema = new Schema<DocItem>({
uid: {type: String, required: false},
style: { type: String, required: true },
text: { type: String, required: true },
});

const DocSchema = new Schema<Doc>({
uid: {type: String, required: false},
title: { type: String, required: true },
tagline: { type: String, required: false },
desc: { type: String, required: false },
docItems: { type: [DocItemSchema], default: [], required: true },
});

const ProjectSchema = new Schema<Project>({
uid: {type: String, required: false},
birth: { type: Date, required: true },
creatorUid: { type: String, required: false },
title: { type: String, required: true },
desc: { type: String, required: false },
logoUrl: { type: String, required: false },
docs: { type: [DocSchema], default: [], required: true },
});

// Create and export User model
const Project: Model<Project> = mongoose.models.Project || model<Project>("Project", ProjectSchema);
export default Project;