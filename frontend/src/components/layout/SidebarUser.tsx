import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { Crown } from "lucide-react";
import { useSubscription } from "../../hooks/useSubscription";

const PLAN_STYLES: Record<string, { label: string; className: string }> = {
  free: {
    label: "Free",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  },
  pro: {
    label: "Pro",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  business: {
    label: "Business",
    className:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
};

interface SidebarUserProps {
  email: string | undefined;
  isCollapsed: boolean;
  onClick?: () => void;
}

export const SidebarUser = ({
  email,
  isCollapsed,
  onClick,
}: SidebarUserProps) => {
  const initials = email?.[0]?.toUpperCase() || "U";
  const { status } = useSubscription();
  const plan = status?.plan ?? "free";
  const planStyle = PLAN_STYLES[plan] || PLAN_STYLES.free;

  return (
    <div className={clsx("px-3 py-3", isCollapsed ? "px-2" : "")}>
      <Link
        to="/profile"
        onClick={onClick}
        className={clsx(
          "flex items-center rounded-xl transition-all duration-150",
          "bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/8",
          isCollapsed ? "justify-center p-2" : "gap-3 p-2.5",
        )}
      >
        <div className="w-8 h-8 rounded-lg bg-primary-500/10 dark:bg-primary-500/20 flex items-center justify-center text-sm font-semibold text-primary-600 dark:text-primary-400 flex-shrink-0">
          {initials}
        </div>

        {!isCollapsed && (
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
              title={email}
            >
              {email}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              {plan !== "free" && (
                <Crown className="h-3 w-3 flex-shrink-0 text-amber-500" />
              )}
              <span
                className={clsx(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                  planStyle.className,
                )}
              >
                {planStyle.label}
              </span>
            </div>
          </div>
        )}
      </Link>
    </div>
  );
};
