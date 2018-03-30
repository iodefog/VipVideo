//
//  HLHomeWindowController.m
//  VipVideo
//
//  Created by LHL on 2017/10/23.
//  Copyright © 2017年 SV. All rights reserved.
//

#import "HLHomeWindowController.h"
#import "AppDelegate.h"

@interface HLHomeWindowController ()<NSWindowDelegate>

@end

@implementation HLHomeWindowController

- (void)windowDidLoad {
    [super windowDidLoad];
    self.window.delegate = self;
    
    //让显示的位置居于屏幕的中心
    [[self window] center];
}

- (void)windowWillClose:(NSNotification *)notification {
    // whichever operations are needed when the
    
}

- (void)windowWillExitFullScreen:(NSNotification *)notification {
    
}

- (void)windowWillEnterFullScreen:(NSNotification *)notification {
    
}

- (BOOL)windowShouldClose:(NSWindow *)sender{
    [self.window orderOut:nil];
    
   AppDelegate *delegate = (AppDelegate *)[NSApplication sharedApplication].delegate;
    if ([delegate.windonwArray containsObject:self]) {
        // 点击关闭按钮时，销毁，同时去除数据中引用。避免内存泄漏
        [delegate.windonwArray removeObject:self];
        return YES;
    }
    else {
        return NO;
    }
}

@end
