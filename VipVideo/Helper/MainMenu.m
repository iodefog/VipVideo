//
//  MainMenu.m
//  VipVideo
//
//  Created by LiHongli on 2017/10/20.
//  Copyright © 2017年 SV. All rights reserved.
//

#import "MainMenu.h"
#import "VipURLManager.h"

@implementation MainMenu

-(id) init {
    // the title will be ignore
    self = [super initWithTitle:@"Main Menu"];
    if(self){
        // NSMenu.menuBarVisible = YES;
        [self createStatusBarItems];
    }
    return self;
}

- (void)createStatusBarItems{
    // 展示窗口
    self.showItem = [[VipURLManager sharedInstance] configurationShowMenuItem:self];
    
    // 新建按钮
    self.creatNewItem = [[VipURLManager sharedInstance] configurationCreateMenuItem:self];

    [[VipURLManager sharedInstance] configurationGoBackMenuItem:self];
    [[VipURLManager sharedInstance] configurationGoForwardMenuItem:self];
    [[VipURLManager sharedInstance] configurationChangeUpMenuItem:self];
    [[VipURLManager sharedInstance] configurationChangeNextMenuItem:self];
    [[VipURLManager sharedInstance] configurationCopyMenuItem:self];

    // this title will be ignore too
    //        NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"application"];
    
    //        self.creatNewItem  = [[NSMenuItem alloc] initWithTitle:@"新建" action:Nil keyEquivalent:new];
    //        [appMenu addItem:self.creatNewItem];
    
    //        [appMenu addItem:[NSMenuItem separatorItem]];
    
    //        [self setSubmenu:appMenu forItem:appItem];
    
    //添加vip解析列表
    NSMenuItem * apiListItem = [[NSMenuItem alloc] initWithTitle:@"切换接口" action:Nil keyEquivalent:@""];
    [self addItem:apiListItem];
    NSMenu *apiListMenu = [[NSMenu alloc] initWithTitle:@"切换接口"];
    [[VipURLManager sharedInstance] configurationVipMenu:apiListMenu];
    [self setSubmenu:apiListMenu forItem:apiListItem];

    // 退出按钮
    self.quitItem = [[VipURLManager sharedInstance] configurationQuitMenuItem:self];
}

+ (void)configuMainMenu:(NSMenu *)menu{
    
    NSMenuItem * managerItem = [[NSMenuItem alloc] initWithTitle:@"管理" action:Nil keyEquivalent:@""];
    NSMenu *manager = [[NSMenu alloc] initWithTitle:@"管理"];
    [menu setSubmenu:manager forItem:managerItem];

    [[VipURLManager sharedInstance] configurationShowMenuItem:manager];
    [[VipURLManager sharedInstance] configurationCreateMenuItem:manager];
    [[VipURLManager sharedInstance] configurationChangeUpMenuItem:manager];
    [[VipURLManager sharedInstance] configurationChangeNextMenuItem:manager];

    NSMenuItem * apiListItem = [[NSMenuItem alloc] initWithTitle:@"切换接口" action:Nil keyEquivalent:@""];
    NSMenu *apiListMenu = [[NSMenu alloc] initWithTitle:@"切换接口"];
    [[VipURLManager sharedInstance] configurationVipMenu:apiListMenu];
    [menu setSubmenu:apiListMenu forItem:apiListItem];

    if (menu.itemArray.count > 2) {
        [menu insertItem:apiListItem atIndex:2];
        [menu insertItem:managerItem atIndex:2];
    }
}



@end
