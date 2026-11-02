import Cocoa
import WebKit

let page = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "http://127.0.0.1:4737"

final class App: NSObject, NSApplicationDelegate {
  var window: NSWindow?

  func applicationDidFinishLaunching(_ notification: Notification) {
    let frame = NSRect(x: 0, y: 0, width: 980, height: 680)
    let window = NSWindow(
      contentRect: frame,
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "Git-Ghost"
    window.center()
    let web = WKWebView(frame: window.contentView?.bounds ?? frame)
    web.autoresizingMask = [.width, .height]
    if let url = URL(string: page) {
      web.load(URLRequest(url: url))
    }
    window.contentView?.addSubview(web)
    window.makeKeyAndOrderFront(nil)
    self.window = window
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }
}

let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
