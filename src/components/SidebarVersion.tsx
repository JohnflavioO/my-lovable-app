import { Link } from 'react-router-dom';
import { useChangelog } from '@/hooks/useChangelog';

export default function SidebarVersion() {
  const { currentVersion } = useChangelog();
  if (!currentVersion) return null;
  return (
    <Link
      to="/sobre"
      className="block text-center text-[11px] text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors mt-2"
    >
      MCI CRM v{currentVersion}
    </Link>
  );
}
