//
//  AppDelegate.m
//  VipVideo
//
//  Created by LHL on 2017/10/23.
//  Copyright © 2017年 SV. All rights reserved.
//

#import "AppDelegate.h"
#import "MainMenu.h"
#import "VipURLManager.h"

@interface AppDelegate ()



@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
    // Insert code here to initialize your application
//    [self configMenu];
    [self configStatusBar];
    [self configMainMenu];
    self.windonwArray = [NSMutableArray array];
}


- (void)applicationWillTerminate:(NSNotification *)aNotification {
    // Insert code here to tear down your application
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)theApplication
                    hasVisibleWindows:(BOOL)flag{
    if (!flag){
        //点击icon 主窗口显示
        [NSApp activateIgnoringOtherApps:NO];
        [[[NSApplication sharedApplication].windows firstObject] makeKeyAndOrderFront:self];
    }
    return YES;
}

- (void)configMainMenu{
    NSApplication *app = [NSApplication sharedApplication];
    [MainMenu configuMainMenu:app.mainMenu];
}

//- (void)configMenu{
//    NSApplication *app = [NSApplication sharedApplication];
//    MainMenu *mainMenu = [[MainMenu alloc] init];
//
//    mainMenu.quitItem.target = self;
//    mainMenu.quitItem.action = @selector(quit:);
//
//    app.mainMenu = mainMenu;
//    NSLog(@"%@",app.mainMenu);
//    for (NSMenuItem *item in  app.mainMenu.itemArray) {
//        NSLog(@"%@",item.title);
//        if ([item.title isEqualToString:@"File"]) {
//            NSMenuItem *subItem = [[NSMenuItem alloc] initWithTitle:@"openVip" action:@selector(openVip:) keyEquivalent:@""];
//            subItem.enabled = NO;
//            subItem.state = NSControlStateValueOn;
//            subItem.offStateImage = [NSImage imageNamed:@"check_normal"];
//            subItem.onStateImage = [NSImage imageNamed:@"check_selected"];
//            [item.submenu insertItem:subItem atIndex:0];
//            break;
//        }
//    }
//}


- (void)configStatusBar{
    self.statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
    self.statusItem.image = [NSImage imageNamed:@"iconStatus"];
    MainMenu *menu = [[MainMenu alloc] init];
    self.statusItem.menu = menu;
}



@end
