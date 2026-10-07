import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@ostiary/core/components/ui/avatar";
import { userInitials } from "@ostiary/core/lib/admin/user-initials";

export type UserMenuIdentityUser = {
  name: string;
  email: string;
  avatar?: string;
};

export function UserMenuIdentity({
  user,
  className,
}: {
  user: UserMenuIdentityUser;
  className?: string;
}) {
  return (
    <div
      className={
        className ??
        "flex items-center gap-2 px-1 py-1.5 text-left text-sm"
      }
    >
      <Avatar className="h-8 w-8 rounded-lg">
        {user.avatar ? (
          <AvatarImage src={user.avatar} alt={user.name} />
        ) : null}
        <AvatarFallback className="rounded-lg">
          {userInitials(user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs">{user.email}</span>
      </div>
    </div>
  );
}
