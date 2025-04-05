{pkgs}: {
  deps = [
    pkgs.nmap
    pkgs.iproute2
    pkgs.jq
    pkgs.postgresql
    pkgs.glibcLocales
    pkgs.libGLU
    pkgs.libGL
  ];
}
