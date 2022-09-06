import path from "path";
import fs from "fs";

export function locateNearestPackageJsonDir(filePath: string): string {
  const dir = path.dirname(filePath);
  const packageJsonFile = path.join(dir, "package.json");
  if (fs.existsSync(packageJsonFile)) {
    return dir;
  }
  return locateNearestPackageJsonDir(dir);
}
