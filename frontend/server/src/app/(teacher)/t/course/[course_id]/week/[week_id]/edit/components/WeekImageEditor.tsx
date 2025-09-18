"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import axios from "@/lib/axios";
import config from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

interface Image {
  id: number;
  name: string;
}

const WeekImageEditor = () => {
  const params = useParams();
  const weekId = params.week_id as string;

  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddImageDialogOpen, setIsAddImageDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageName, setImageName] = useState("");
  const [uploading, setUploading] = useState(false);

  const fetchImages = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/get_images/${weekId}`);
      setImages(response.data);
    } catch (error) {
      console.error("Error fetching images:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (weekId) {
      fetchImages();
    }
  }, [weekId]);

  const handleDeleteImage = async (imageId: number) => {
    try {
      await axios.delete(`/image/${imageId}`);
      fetchImages(); // Refresh images after deletion
    } catch (error) {
      console.error("Error deleting image:", error);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUploadImage = async () => {
    if (!selectedFile || !imageName || !weekId) return;

    setUploading(true);

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const arrayBuffer = reader.result as ArrayBuffer;
            const uint8Array = new Uint8Array(arrayBuffer);
            let hexString = "";
            uint8Array.forEach(byte => {
                hexString += String.fromCharCode(92) + 'x' + byte.toString(16).padStart(2, '0');
            });

            const payload = {
                imgdata: hexString,
                name: imageName,
                week_id: parseInt(weekId, 10)
            };

            await axios.post('/image', payload, {
                headers: { 'Content-Type': 'application/json' }
            });

            setIsAddImageDialogOpen(false);
            setSelectedFile(null);
            setImageName("");
            fetchImages();
        } catch (error) {
            console.error("Error uploading image:", error);
        } finally {
            setUploading(false);
        }
    };
    reader.onerror = () => {
        console.error("Error reading file");
        setUploading(false);
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>画像の管理</CardTitle>
        <Dialog open={isAddImageDialogOpen} onOpenChange={setIsAddImageDialogOpen}>
          <DialogTrigger asChild>
            <Button>画像を追加</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新しい画像を追加</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="image-name" className="text-right">
                  画像名
                </Label>
                <Input id="image-name" value={imageName} onChange={(e) => setImageName(e.target.value)} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="image-file" className="text-right">
                  ファイル
                </Label>
                <Input id="image-file" type="file" accept="image/*" onChange={handleFileChange} className="col-span-3" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddImageDialogOpen(false)}>キャンセル</Button>
              <Button onClick={handleUploadImage} disabled={!selectedFile || !imageName || uploading}>
                {uploading ? "アップロード中..." : "アップロード"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p>画像を読み込み中...</p>
        ) : images.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((image) => (
              <Card key={image.id}>
                <CardContent className="p-2">
                  <img
                    src={`${config.apiBaseUrl}/get_image/${image.id}`}
                    alt={image.name}
                    className="w-full h-40 object-cover rounded-md"
                  />
                </CardContent>
                <CardFooter className="flex justify-between items-center p-2">
                  <p className="text-sm truncate">{image.name}</p>
                  <Button variant="destructive" size="icon" onClick={() => handleDeleteImage(image.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <p>画像はまだありません。</p>
        )}
      </CardContent>
    </Card>
  );
};

export default WeekImageEditor;
