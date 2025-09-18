import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, FileText, Megaphone } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import axios from "@/lib/axios";
import ReactMarkdown from "react-markdown";

interface Announcement {
  id: number;
  title: string;
  content: string;
  start_date_time: string;
  end_date_time: string;
  send_date_time: string;
  sender: string;
  is_active: boolean;
  is_read: boolean;
}

interface AnnouncementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}

export function AnnouncementsDialog({ open, onOpenChange, onClose }: AnnouncementsDialogProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await axios.get("/announcements_list");
      const currentTime = new Date();
      
      const filteredAnnouncements = response.data.filter((announcement: Announcement) => {
        const startTime = new Date(announcement.start_date_time);
        const endTime = new Date(announcement.end_date_time);
        return announcement.is_active && currentTime >= startTime && currentTime <= endTime;
      });
      
      setAnnouncements(filteredAnnouncements);
    } catch (error) {
      console.error("Error fetching announcements:", error);
      setErrorMessage("お知らせの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchAnnouncements();
    }
  }, [open]);

  const handleShowDetails = async (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setIsDetailModalOpen(true);

    if (!announcement.is_read) {
      try {
        await axios.post(`/announcements/${announcement.id}/read`);
        setAnnouncements(prev => 
          prev.map(a => a.id === announcement.id ? { ...a, is_read: true } : a)
        );
      } catch (error) {
        console.error("Failed to mark announcement as read:", error);
      }
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
  };
  
  const processDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };
  
  const handleClose = () => {
    onOpenChange(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Megaphone className="h-6 w-6" />
            お知らせ
          </DialogTitle>
        </DialogHeader>
        <div className="notification-list-container p-0">
          {loading ? (
             <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
            </div>
          ) : errorMessage ? (
            <Alert variant="destructive" className="m-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : announcements.length > 0 ? (
            <div className="border rounded-lg max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-primary text-primary-foreground">
                  <tr>
                    <th className="text-left font-medium p-3 w-32">日付</th>
                    <th className="text-left font-medium p-3">タイトル</th>
                    <th className="text-left font-medium p-3 w-40">作成者</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {announcements.map((announcement) => (
                    <tr
                      key={announcement.id}
                      onClick={() => handleShowDetails(announcement)}
                      className={`cursor-pointer hover:bg-muted/50 ${!announcement.is_read ? "font-semibold bg-primary/5" : ""}`}
                    >
                      <td className="p-3 text-muted-foreground">
                        {formatDate(announcement.send_date_time)}
                      </td>
                      <td className="p-3">{announcement.title}</td>
                      <td className="p-3 text-muted-foreground">
                        {announcement.sender}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Megaphone className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500">現在、アクティブなお知らせはありません。</p>
            </div>
          )}
        </div>
        <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              閉じる
            </Button>
        </DialogFooter>

        <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-primary">
                      <FileText className="h-6 w-6" />
                      お知らせ詳細
                  </DialogTitle>
              </DialogHeader>
              {selectedAnnouncement && (
                  <div className="space-y-6 py-4">
                      <div>
                          <strong className="text-sm font-semibold text-primary">タイトル</strong>
                          <p className="mt-1 text-xl font-bold">{selectedAnnouncement.title}</p>
                      </div>
                      <div className="border-t pt-6">
                          <strong className="text-sm font-semibold text-primary">本文</strong>
                          <div className="prose prose-sm max-w-none mt-2">
                              <ReactMarkdown>{selectedAnnouncement.content}</ReactMarkdown>
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-6 border-t">
                        <div>
                            <strong className="text-sm font-semibold text-primary">表示期間</strong>
                            <p className="mt-1 text-sm text-muted-foreground">{processDate(selectedAnnouncement.start_date_time)} ～ {processDate(selectedAnnouncement.end_date_time)}</p>
                        </div>
                        <div>
                            <strong className="text-sm font-semibold text-primary">発信者</strong>
                            <p className="mt-1 text-sm text-muted-foreground">{selectedAnnouncement.sender}</p>
                        </div>
                      </div>
                  </div>
              )}
              <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
                  閉じる
                  </Button>
              </DialogFooter>
            </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
