{pkgs}: {
  deps = [
    pkgs.postgresql
    pkgs.glibcLocales
    pkgs.libGLU
    pkgs.libGL
  ];
}
