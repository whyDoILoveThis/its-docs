import '@/styles'

declare global {

    type MaybeString = string | null | undefined;
  
    interface User {
        uid: MaybeString;
        fullName: MaybeString;
        firstName: MaybeString;
        email: MaybeString;
        bio: MaybeString;
    }
  
    interface Project {
        uid: string;
        birth: Date;
        creatorUid?: string;
        title: string;
        desc?: string;
        logoUrl?: string;
        githubOwner?: string;
        githubRepo?: string;
        docs?: Doc[];
        pdmDiagrams?: PDMDiagram[];
    }
    
    interface Doc {
        uid: string;
        title: string;
        tagline?: string;
        desc?: string
        docItems?: DocItem[];
    }
  
    interface DocItem {
        uid: string;
        style: string;
        text: string;
    }

    interface PDMNode {
        uid: string;
        label: string;
        color?: string;
    }

    interface PDMEdge {
        uid: string;
        fromNodeUid: string;
        toNodeUid: string;
        color?: string;
    }

    interface PDMDiagram {
        uid: string;
        title: string;
        orientation: 'horizontal' | 'vertical';
        nodes: PDMNode[];
        edges: PDMEdge[];
    }
  }