import '@/styles'

declare global {

    type MaybeString = string | null | undefined;

    interface User {
        uid: MaybeString;
        fullName: MaybeString;
        firstName: MaybeString;
        email: MaybeString;
        projects?: Project[];
    }

    interface Project {
        projectBirth: Date;
        projectCreator?: string;
        projectName: string;
        projectDesc?: string;
        projectLogo?: string;
        docs: Doc[];
    }
    
    interface Doc {
        docTitle: string;
        docTagline?: string;
        docDesc?: string
        docItems: DocItem[];
    }

    interface DocItem {
        style: string;
        text: string;
    }
}