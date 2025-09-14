import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, Megaphone } from "lucide-react";
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
            <ul className="divide-y divide-gray-200 max-h-[60vh] overflow-y-auto">
              {announcements.map((announcement) => (
                <li
                  key={announcement.id}
                  onClick={() => handleShowDetails(announcement)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 ${!announcement.is_read ? 'font-bold' : ''}`}
                >
                  <div className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-2 text-sm text-gray-600">
                      {formatDate(announcement.send_date_time)}
                    </div>
                    <div className="col-span-8">
                      {announcement.title}
                    </div>
                    <div className="col-span-2 text-sm text-gray-600">
                      {announcement.sender}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
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
                <DialogTitle>メッセージ 確認</DialogTitle>
            </DialogHeader>
            {selectedAnnouncement && (
                <div className="space-y-4 p-4">
                <div className="flex items-center">
                    <strong className="w-24">表示期間</strong>
                    <span>{processDate(selectedAnnouncement.start_date_time)} ～ {processDate(selectedAnnouncement.end_date_time)}</span>
                </div>
                <div className="flex items-start">
                    <strong className="w-24">タイトル</strong>
                    <span>{selectedAnnouncement.title}</span>
                </div>
                <div className="flex items-start">
                    <strong className="w-24">本文</strong>
                    <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{selectedAnnouncement.content}</ReactMarkdown>
                    </div>
                </div>
                <div className="flex items-center">
                    <strong className="w-24">発信者</strong>
                    <span>{selectedAnnouncement.sender}</span>
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
