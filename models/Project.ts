import mongoose, { Document, Schema, Model, model } from "mongoose";

interface Project extends Document {
    uid: string;
    birth: Date;
    creatorUid?: string;
    title: string;
    desc?: string;
    logoUrl?: string;
    githubOwner?: string;
    githubRepo?: string;
    docs: Doc[];
    pdmDiagrams: PDMDiagram[];
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

interface PDMNode extends Document {
    uid: string;
    label: string;
    color?: string;
}

interface PDMEdge extends Document {
    uid: string;
    fromNodeUid: string;
    toNodeUid: string;
    color?: string;
}

interface PDMDiagram extends Document {
    uid: string;
    title: string;
    orientation: string;
    nodes: PDMNode[];
    edges: PDMEdge[];
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

const PDMNodeSchema = new Schema<PDMNode>({
uid: { type: String, required: true },
label: { type: String, required: true },
color: { type: String, required: false },
});

const PDMEdgeSchema = new Schema<PDMEdge>({
uid: { type: String, required: true },
fromNodeUid: { type: String, required: true },
toNodeUid: { type: String, required: true },
color: { type: String, required: false },
});

const PDMDiagramSchema = new Schema<PDMDiagram>({
uid: { type: String, required: true },
title: { type: String, required: true },
orientation: { type: String, default: 'horizontal' },
nodes: { type: [PDMNodeSchema], default: [] },
edges: { type: [PDMEdgeSchema], default: [] },
});

const ProjectSchema = new Schema<Project>({
uid: {type: String, required: false},
birth: { type: Date, required: true },
creatorUid: { type: String, required: false },
title: { type: String, required: true },
desc: { type: String, required: false },
logoUrl: { type: String, required: false },
githubOwner: { type: String, required: false },
githubRepo: { type: String, required: false },
docs: { type: [DocSchema], default: [], required: true },
pdmDiagrams: { type: [PDMDiagramSchema], default: [] },
});

// Re-register model in dev so schema changes take effect without restart
if (process.env.NODE_ENV !== "production" && mongoose.models.Project) {
  delete mongoose.models.Project;
}

const Project: Model<Project> = mongoose.models.Project || model<Project>("Project", ProjectSchema);
export default Project;