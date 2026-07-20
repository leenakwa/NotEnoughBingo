import type { components as ApiComponents } from "@/lib/api/schema";

type ApiSchemas = ApiComponents["schemas"];

export type PublicId = string;

export type Visibility = ApiSchemas["VisibilityEnum"];
export type CompletionStyle = ApiSchemas["MarkingStyleEnum"];
export type PublishStatus = ApiSchemas["BingoStatus"];

export interface MediaAsset {
  id: PublicId;
  kind: "cover" | "board_background" | "cell_image" | "avatar" | "export";
  status: ApiSchemas["MediaAssetStatus"];
  url: string | null;
  thumbnail_url?: string | null;
  width?: number | null;
  height?: number | null;
  mime_type: string;
  rejection_reason?: string;
}

export interface PublicUser {
  id: PublicId;
  username: string;
  display_name: string;
  avatar: MediaAsset | null;
}

export interface AuthenticatedUser extends PublicUser {
  email: string;
  email_verified: boolean;
}

export interface Tag {
  id: PublicId;
  name: string;
  slug: string;
  usage_count?: number;
}

export interface BingoStats {
  likes: number;
  comments: number;
  plays: number;
  shares: number;
  views: number;
}

export interface BingoSummary {
  id: PublicId;
  title: string;
  description: string;
  author: PublicUser;
  cover: MediaAsset | null;
  tags: Tag[];
  size: number;
  status: PublishStatus;
  visibility: Visibility;
  completion_style: CompletionStyle;
  stats: BingoStats;
  liked_by_me: boolean;
  published_at: string | null;
  updated_at: string;
}

export interface RevisionCell {
  id?: PublicId;
  row: number;
  column: number;
  text: string;
  text_color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  background_color: string;
  background_opacity: number;
  image: MediaAsset | null;
  image_opacity: number;
  border_color: string;
  border_width: number;
  border_style: ApiSchemas["BorderStyleEnum"];
}

export interface BingoRevision {
  id: PublicId;
  number: number;
  title: string;
  description: string;
  size: number;
  board_background: MediaAsset | null;
  cover: MediaAsset | null;
  completion_style: CompletionStyle;
  cells: RevisionCell[];
  published_at: string;
}

export interface BingoDetail extends BingoSummary {
  current_revision: BingoRevision | null;
  editable_draft?: BingoDraft | null;
  permissions: {
    can_edit: boolean;
    can_comment: boolean;
    can_like: boolean;
    can_report: boolean;
  };
}

export interface BingoDraft {
  id: PublicId;
  bingo_id: PublicId | null;
  title: string;
  description: string;
  size: number;
  visibility: Visibility;
  completion_style: CompletionStyle;
  board_background: MediaAsset | null;
  cover: MediaAsset | null;
  tags: Tag[];
  cells: RevisionCell[];
  updated_at: string;
  version: number;
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface PlayProgress {
  public_id: PublicId | null;
  bingo_id: PublicId;
  revision_id: PublicId;
  revision_number: number;
  selected_cells: string[];
  version: number;
  stale: boolean;
  reset_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SharedResult {
  id: PublicId;
  bingo_id: PublicId;
  owner_display_name: string;
  owner: PublicUser | null;
  revision: BingoRevision;
  selected_cells: string[];
  created_at: string;
}

export interface UserPrivacySettings {
  show_bio: boolean;
  show_created_bingos: boolean;
  show_play_history: boolean;
  show_shared_results: boolean;
  show_followers: boolean;
  show_following: boolean;
}

export interface UserProfile extends PublicUser {
  profile_id?: PublicId;
  bio: string;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  privacy: UserPrivacySettings;
  created_bingos?: Page<BingoSummary>;
  recent_bingos?: Page<BingoSummary>;
}

export interface ProfilePlayHistoryItem {
  public_id: PublicId;
  bingo_id: PublicId;
  bingo_title: string;
  revision_number: number;
  selected_count: number;
  updated_at: string;
}

export interface ProfileSharedResultItem {
  id: PublicId;
  bingo_id: PublicId;
  bingo_title: string;
  revision_number: number;
  selected_count: number;
  share_url: string;
  created_at: string;
}

export interface ProfileUpdate {
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_id?: PublicId | null;
}

export interface Comment {
  id: PublicId;
  author: PublicUser;
  body: string;
  parent_id: PublicId | null;
  like_count: number;
  reply_count: number;
  is_liked: boolean;
  replies: Comment[];
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export type NotificationKind =
  "bingo_comment" | "comment_reply" | "bingo_like" | "comment_like" | "new_follower";

export interface Notification {
  id: PublicId;
  kind: NotificationKind;
  actor: PublicUser | null;
  message: string;
  target_url: string;
  read_at: string | null;
  created_at: string;
}

export interface SessionMetadata {
  id: PublicId;
  created_at: string;
  last_seen_at: string;
  ip_hint: string;
  user_agent: string;
  current: boolean;
}

export interface NotificationPreferences {
  new_comment: boolean;
  comment_reply: boolean;
  bingo_like: boolean;
  comment_like: boolean;
  new_follower: boolean;
  marketing_email: boolean;
}

export interface AuthResult {
  user: AuthenticatedUser;
}

export interface RegistrationResult {
  status: "verification_required";
}

export type UploadIntent = ApiSchemas["UploadIntentRequest"];
export type UploadTicket = ApiSchemas["UploadIntentResponse"];

export interface ExportJob {
  id: PublicId;
  kind: ApiSchemas["ExportJobKindEnum"];
  format: ApiSchemas["ExportJobFormatEnum"];
  status: ApiSchemas["ExportStatus"];
  download_url: string | null;
  error: string | null;
  created_at: string;
  completed_at?: string | null;
  expires_at?: string | null;
}

export type BingoExportFormat = ApiSchemas["ExportRequestFormatEnum"];

export type ReportTargetType = ApiSchemas["TargetTypeEnum"];
export type ReportReason = ApiSchemas["ReasonEnum"];

export interface ReportCreated {
  report_id: PublicId;
  status: "open" | "in_review" | "resolved" | "dismissed";
}

export type ClientInteractionType = Exclude<
  ApiSchemas["EventTypeEnum"],
  "like" | "unlike" | "share" | "comment" | "follow"
>;

export type ClientInteraction = Omit<
  ApiSchemas["InteractionEventRequest"],
  "event_type" | "anonymous_id"
> & {
  event_type: ClientInteractionType;
  anonymous_id: string;
};

export interface AccountDeletionResult {
  request_id: PublicId;
  status: "scheduled" | "cancelled" | "processing" | "complete" | "failed";
  scheduled_for: string;
}

export interface AccountExportResult {
  job_id: PublicId;
  status: ExportJob["status"];
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
  request_id?: string;
}
