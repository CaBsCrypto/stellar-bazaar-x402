import {Navbar} from "@/components/Navbar";
import {Footer} from "@/components/Footer";
import {Catalog} from "@/components/Catalog";
import {PageShell} from "@/components/ui";
export const dynamic = 'force-dynamic';
export default function CatalogoPage(){return <main><Navbar /><PageShell><Catalog standalone marketEnabled={process.env.BAZAAR_ENABLE_MARKETPLACE === 'true'}/></PageShell><Footer /></main>;}
