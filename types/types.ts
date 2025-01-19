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
        docs?: Doc[];
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
  }